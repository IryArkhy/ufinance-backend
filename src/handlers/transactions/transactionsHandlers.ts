import { Account, Prisma, PrismaClient, UserBalance } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { updateTotalBalance } from '../../lib/balance';
import {
  DepositWithdrawalReqBody,
  TransferReqBody,
  UpdateDepositWithdrawalReqBody,
  UpdateTransferReqBody,
} from './types';
import {
  calculateNewAccountBalance,
  createNewTransaction,
  updateAccountBalance,
} from './utils';

export const getTransactionsByAccount = async (
  req: RequestWithUser<
    { accountId: string },
    any,
    any,
    { cursor?: string; limit?: string }
  >,
  res: Response,
  next: NextFunction,
) => {
  const { params, query } = req;
  const { cursor, limit } = query;
  const pasedLimit = limit ? parseInt(limit) : 20;

  try {
    const transactions = await prisma.transaction.findMany({
      skip: 1,
      take: pasedLimit,
      ...(cursor
        ? {
            cursor: {
              id: cursor,
            },
          }
        : {}),
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      where: {
        OR: [
          { fromAccountId: params.accountId },
          { toAccountId: params.accountId },
        ],
      },
      include: {
        tags: {
          include: {
            tag: true,
          },
        },
        category: true,
        payee: true,
        fromAccount: true,
        toAccount: true,
      },
    });

    const count = await prisma.transaction.count({
      where: {
        OR: [
          { fromAccountId: params.accountId },
          { toAccountId: params.accountId },
        ],
      },
    });

    res.status(200).json({
      transactions,
      limit: pasedLimit,
      cursor,
      count,
    });
  } catch (error) {
    next(error);
  }
};

export const createTransaction = async (
  req: RequestWithUser<any, any, DepositWithdrawalReqBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { newTransaction, totalBalance, accountBalance } =
      await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          return await createNewTransaction(req.body, req.user.id, tx);
        },
        { timeout: 10 * 1000 },
      );

    res.status(200).json({
      transaction: newTransaction,
      totalBalance,
      accountBalance,
    });
  } catch (error) {
    next(error);
  }
};

export const createTransfer = async (
  req: RequestWithUser<any, any, TransferReqBody>,
  res: Response,
  next: NextFunction,
) => {
  const {
    fromAccountId,
    toAccountId,
    fromAccountAmount,
    toAccountAmount,
    date,
    description,
  } = req.body;

  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const newTransaction = await tx.transaction.create({
          data: {
            userId: req.user.id,
            type: 'TRANSFER',
            fromAccountId,
            amount: fromAccountAmount,
            toAccountId,
            toAccountAmount,
            date: new Date(date),
            description,
          },
          include: {
            fromAccount: true,
            toAccount: true,
            tags: {
              include: {
                tag: true,
              },
            },
            category: true,
            payee: true,
          },
        });
        const fromAccount = await tx.account.update({
          where: {
            id: fromAccountId,
          },
          data: {
            balance: {
              decrement: fromAccountAmount,
            },
          },
        });

        if (!fromAccount.isCredit && fromAccount.balance < 0) {
          throw new Error(
            'Insufficient balance. Make this account a credit one.',
          );
        }

        const toAccount = await tx.account.update({
          where: {
            id: toAccountId,
          },
          data: {
            balance: {
              increment: toAccountAmount,
            },
          },
        });

        return { newTransaction, fromAccount, toAccount };
      },
      {
        timeout: 10 * 1000,
      },
    );

    res.status(200).json({
      transaction: result.newTransaction,
      fromAccount: {
        id: result.fromAccount.id,
        balance: result.fromAccount.balance,
      },
      toAccount: {
        id: result.toAccount.id,
        balance: result.toAccount.balance,
      },
    });
  } catch (error) {
    next(error);
  }
};

export const updateTransaction = async (
  req: RequestWithUser<{ id: string }, any, UpdateDepositWithdrawalReqBody>,
  res: Response,
  next: NextFunction,
) => {
  const {
    fromAccountId,
    amount,
    date,
    description,
    payeeId,
    categoryId,
    tagNames = [],
    transactionType,
  } = req.body;

  // Cases
  // 1. Account changed
  //    -> delete transaction from old balance
  //    -> create a new Transaction for a new Account
  // 2. Amount changed
  //    -> calculate the difference
  //    -> update account balance
  //    -> update total balance
  // 3. Amount changed & Account changed
  //    -> delete transaction from old balance
  //    -> create a new Transaction for a new Account
  //    -> update total balance

  try {
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const transaction = await tx.transaction.findUnique({
          where: {
            id: req.params.id,
          },
        });

        if (transaction.fromAccountId !== fromAccountId) {
          const createNewTransactionResult = await createNewTransaction(
            req.body,
            req.user.id,
            tx,
          );

          await tx.account.update({
            where: {
              id: transaction.fromAccountId,
            },
            data: {
              balance:
                transaction.type === 'WITHDRAWAL'
                  ? { increment: transaction.amount }
                  : { decrement: transaction.amount },
            },
          });

          const deletedTransaction = await tx.transaction.delete({
            where: {
              id: req.params.id,
            },
            include: {
              fromAccount: true,
            },
          });

          const totalBalance = await updateTotalBalance({
            userId: req.user.id,
            reason: 'REMOVE_TRANSACTION',
            updateAmount: deletedTransaction.amount,
            updateCurrency: deletedTransaction.fromAccount.currency,
            transactionId: deletedTransaction.id,
            tx: tx,
          });

          return {
            transaction: createNewTransactionResult.newTransaction,
            totalBalance,
          };
        } else {
          // 1. Amount same && Transaction Type Same -> do nothing with account
          // 2. Amount changed && Type Same -> calculate difference, update account
          // -> If deposit: (balance - oldAmount + newAmount)
          // newAmount > oldAmount -> currentBalance - oldAmount + newAmount; 120 + 13 = 133 | 120 + 20 = 140; 133 - 13 + 30 = 120 + 20 = 140
          // newAmount < oldAmount -> currentBalance - oldAmount + newAmount; 120 + 20 = 140 | 120 + 13 = 133; 140 - 20 + 13 = 133;
          // -> If withdrawal: (balance + oldAmount - newAmount)
          // newAmount > oldAmount; currentBalance + oldAmount - newAmount   || 120 - (15) = 105; 120 - (30) = 90 |  105 + 15 - 30 = 120 - 30 = 90;
          // newAmount < oldAmount; currentBalance + oldAmount - newAmount || 120 - (30) = 90 | 120 - (15) = 105; 90 + 30 - 15 = 120 - 15 = 105;
          // 3. Amount same && Type Changed
          // -> Was deposit: currentBalance - amount * 2; 120 + 30 = 150 ; 120 - 30 = 90 | 150 - 30 * 2 = 150 - 60 = 90
          // -> Was withdrawal: currentBalance + amount * 2;     120 - 30 = 90 ; 120 + 30 = 150 | 90 + 30 * 2 = 150;
          // 4. Amount changed && Type Changed
          // withdraw 120 -> deposit 30: currentBalance + oldAmount + newAmount     ||  200 - 120 = 80 | 200 + 30 = 230 | 80 + 120 + 30 = 230
          // deposit  30  -> withdraw 40: currentBalance - oldAmount - newAmount    ||  200 + 30  = 230 | 200 - 40 = 160 | 230 - 30 - 40 = 160;
          const tagsResult = tagNames.length
            ? await Promise.all(
                tagNames.map(
                  async name =>
                    await tx.tag.upsert({
                      where: {
                        TagIdentifier: {
                          userId: req.user.id,
                          name,
                        },
                      },
                      create: {
                        name,
                        userId: req.user.id,
                      },
                      update: {},
                    }),
                ),
              )
            : [];

          const tags = tagsResult.length
            ? {
                tags: {
                  deleteMany: {},

                  createMany: {
                    data: tagsResult.map(tag => ({ tagId: tag.id })),
                  },
                },
              }
            : {};

          const updatedTransaction = await tx.transaction.update({
            where: {
              id: req.params.id,
            },
            data: {
              fromAccountId,
              date: new Date(date),
              type: transactionType,
              categoryId,
              payeeId,
              amount,
              description,
              ...tags,
            },
            include: {
              fromAccount: true,
              toAccount: true,
              category: true,
              payee: true,
              tags: {
                include: {
                  tag: true,
                },
              },
            },
          });

          const account = await tx.account.findUnique({
            where: {
              id: fromAccountId,
            },
          });

          const newBalance = calculateNewAccountBalance(
            account.balance,
            {
              type: transaction.type as 'WITHDRAWAL' | 'DEPOSIT',
              amount: transaction.amount,
            },
            {
              type: updatedTransaction.type as 'WITHDRAWAL' | 'DEPOSIT',
              amount: updatedTransaction.amount,
            },
          );

          if (!account.isCredit && newBalance < 0) {
            throw new Error(
              'Cannot update transaction: insufficient account balance',
            );
          }

          await tx.account.update({
            where: {
              id: account.id,
            },
            data: {
              balance: newBalance,
            },
          });

          // 80 -> 75 | delta = -5: 75 - 80 = -5
          // -80 -> 20 | delta = 100: 20 - -80 = 100
          // 80 -> -5 | delta = -85: -5 - 80 = -85
          // -80 -> -5 | delta = 75: -5 - -80 = 75
          // ---> newBalance - oldBalance

          const accountBalanceDelta = account.balance - newBalance;

          const totalBalance = await updateTotalBalance({
            userId: req.user.id,
            reason: 'UPDATE_TRANSACTION',
            updateAmount: accountBalanceDelta,
            updateCurrency: account.currency,
            transactionId: updatedTransaction.id,
            tx: tx,
          });

          return {
            transaction: updatedTransaction,
            totalBalance,
          };
        }
      },
      { timeout: 10 * 1000 },
    );

    res.status(200).json({
      transaction: result.transaction,
      totalBalance: result.totalBalance,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTransfer = async (
  req: RequestWithUser<{ id: string }, any, UpdateTransferReqBody>,
  res: Response,
  next: NextFunction,
) => {
  const { body, user, params } = req;

  const { fromAccountAmount, ...restBody } = body;

  try {
    const { transaction } = await prisma.$transaction(
      async tx => {
        const deletedTransaction = await tx.transaction.delete({
          where: {
            id: params.id,
          },
          include: {
            fromAccount: true,
            toAccount: true,
          },
        });

        const oldFromAccount = await tx.account.update({
          where: {
            id: deletedTransaction.fromAccountId,
          },
          data: {
            balance: {
              increment: deletedTransaction.amount,
            },
          },
        });

        if (!oldFromAccount.isCredit && oldFromAccount.balance < 0) {
          throw new Error(
            'Insufficient balance. Make this account a credit one.',
          );
        }

        const oldToAccount = await tx.account.update({
          where: {
            id: deletedTransaction.toAccountId,
          },
          data: {
            balance: {
              decrement: deletedTransaction.toAccountAmount,
            },
          },
        });

        const newTransfer = await tx.transaction.create({
          data: {
            userId: user.id,
            amount: fromAccountAmount,
            ...restBody,
            type: 'TRANSFER',
          },
          include: {
            fromAccount: true,
            toAccount: true,
            tags: {
              include: {
                tag: true,
              },
            },
            category: true,
            payee: true,
          },
        });

        // const {
        //   amount: oldFromAccountAmount,
        //   fromAccountId: oldSendingAccount,
        //   toAccountId: oldReceivingAccount,
        //   toAccountAmount: oldToAccountAmount,
        // } = oldTransferData;
        // const {
        //   amount: newFromAccountAmount,
        //   fromAccountId: newSendingAccount,
        //   toAccountId: newReceivingAccount,
        //   toAccountAmount: newToAccountAmount,
        // } = updatedTransferData;

        // const isAmountChanged =
        //   oldFromAccountAmount === newFromAccountAmount &&
        //   oldToAccountAmount === newToAccountAmount;

        // const isSendingAccountChanged = oldSendingAccount !== newSendingAccount;
        // const isReceivingAccountChanged =
        //   oldReceivingAccount !== newReceivingAccount;

        const fromAccount = await tx.account.update({
          where: {
            id: newTransfer.fromAccountId,
          },
          data: {
            balance: {
              decrement: newTransfer.amount,
            },
          },
        });

        if (!fromAccount.isCredit && fromAccount.balance < 0) {
          throw new Error(
            'Insufficient balance. Make this account a credit one.',
          );
        }

        const toAccount = await tx.account.update({
          where: {
            id: newTransfer.toAccountId,
          },
          data: {
            balance: {
              increment: newTransfer.toAccountAmount,
            },
          },
        });

        return { transaction: newTransfer };
      },
      { timeout: 10 * 1000 },
    );

    res.status(200).json({
      transaction,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTransaction = async (
  req: RequestWithUser<{ accountId: string; id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { transaction, updatedAccount } = await prisma.$transaction(
      async tx => {
        await tx.transaction.update({
          where: {
            TransactionIdentifier: {
              fromAccountId: req.params.accountId,
              id: req.params.id,
            },
          },
          data: {
            tags: {
              deleteMany: {},
            },
          },
        });

        const deletedTransaction = await tx.transaction.delete({
          where: {
            TransactionIdentifier: {
              fromAccountId: req.params.accountId,
              id: req.params.id,
            },
          },
          include: {
            fromAccount: true,
          },
        });

        const updatedAccount = await updateAccountBalance(
          req.params.accountId,
          deletedTransaction.type === 'DEPOSIT' ? 'WITHDRAWAL' : 'DEPOSIT',
          deletedTransaction.amount,
          tx,
        );

        const totalBalance = await updateTotalBalance({
          userId: req.user.id,
          reason: 'REMOVE_TRANSACTION',
          updateAmount: deletedTransaction.amount,
          updateCurrency: deletedTransaction.fromAccount.currency,
          transactionId: deletedTransaction.id,
          tx: tx,
        });

        return { transaction: deletedTransaction, updatedAccount };
      },
      { timeout: 10 * 1000 },
    );

    res.status(200).json({
      transaction,
      updatedAccount,
    });
  } catch (error) {
    next(error);
  }
};

export const deleteTransfer = async (
  req: RequestWithUser<{ accountId: string; id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { transaction, fromAccount, toAccount } = await prisma.$transaction(
      async tx => {
        const deletedTransaction = await tx.transaction.delete({
          where: {
            TransactionIdentifier: {
              fromAccountId: req.params.accountId,
              id: req.params.id,
            },
          },
          include: {
            fromAccount: true,
            toAccount: true,
          },
        });

        const fromAccount = await updateAccountBalance(
          deletedTransaction.fromAccountId,
          'DEPOSIT',
          deletedTransaction.amount,
          tx,
        );
        const toAccount = await updateAccountBalance(
          deletedTransaction.toAccountId,
          'WITHDRAWAL',
          deletedTransaction.toAccountAmount,
          tx,
        );

        const totalBalance = await updateTotalBalance({
          userId: req.user.id,
          reason: 'REMOVE_TRANSACTION',
          updateAmount: deletedTransaction.amount,
          updateCurrency: deletedTransaction.fromAccount.currency,
          transactionId: deletedTransaction.id,
          tx: tx,
        });

        return { transaction: deletedTransaction, fromAccount, toAccount };
      },
      { timeout: 10 * 1000 },
    );

    res.status(200).json({
      transaction,
      fromAccount,
      toAccount,
    });
  } catch (error) {
    next(error);
  }
};
