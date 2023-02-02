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
    { offset?: string; limit?: string }
  >,
  res: Response,
  next: NextFunction,
) => {
  const { params, query } = req;
  const { offset, limit } = query;
  const pasedOffset = offset ? parseInt(offset) : 0;
  const pasedLimit = limit ? parseInt(limit) : 20;

  try {
    const transactions = await prisma.transaction.findMany({
      skip: pasedOffset,
      take: pasedLimit,
      orderBy: {
        date: 'desc',
      },
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
        fromAccountId: params.accountId,
      },
    });

    const newOffset = pasedOffset + pasedLimit;

    res.status(200).json({
      transactions,
      limit,
      offset: newOffset > count ? null : newOffset,
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
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return await createNewTransaction(req.body, req.user.id, tx);
      });

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

  // 1. A changed, B same, Amount Same
  // 2. A same, B changed, Amount Same
  // 3.  A same, B same, Amount changed
  // 4.  A canged, B same, Amount changed
  // 5.  A same, B changed, Amount changed
  // 6.  A changed, B changed, Amount changed

  /**
   * if(Amount Same)  {
   *    if(A same && B same) return;
   *    if (A same & B changed) {
   *        // rollback B.balance ( - transfer amount)
   *        // update new B.balance (+ transfer amount)
   *    }
   *
   *    if(A changed & B same) {
   *        // rollback A.balance (+ transfer amount)
   *        // update new A.balance (- transfer amount)
   *    }
   * } else {
   *    if(A same & B same) {
   *        1. A.balance + oldAmount - newAmount
   *        2. B.balance - oldAmount + newAmount
   *    }
   *
   *    if(A changed, B same) {
   *        1. rollback A.balance (+ oldAmount)
   *        2. new A.balance - newAmount
   *        3. update B.balance - oldAmount + newAmount
   *    }
   *
   *    if(A same, B changed) {
   *        1. rollback B.balance (- oldAmount)
   *        2. new B.balance + newAmount
   *        3. A.balance + oldAmount - newAmount
   *    }
   *
   *    if(A changed, B changed) {
   *        1. rollback A.balance (+ oldAmount)
   *        2. rollback B.balance (- oldAmount)
   *        3. new A.balance - newAmount
   *        4. new B.balance + newAmount
   *    }
   * }
   */

  try {
    const { transaction, totalBalance } = await prisma.$transaction(
      async tx => {
        const oldTransferData = await tx.transaction.findUnique({
          where: {
            id: params.id,
          },
        });

        const updatedTransferData = await tx.transaction.update({
          where: {
            id: params.id,
          },
          data: {
            ...restBody,
            amount: fromAccountAmount,
          },
          include: {
            fromAccount: true,
            toAccount: true,
          },
        });

        const {
          amount: oldFromAccountAmount,
          fromAccountId: oldSendingAccount,
          toAccountId: oldReceivingAccount,
          toAccountAmount: oldToAccountAmount,
        } = oldTransferData;
        const {
          amount: newFromAccountAmount,
          fromAccountId: newSendingAccount,
          toAccountId: newReceivingAccount,
          toAccountAmount: newToAccountAmount,
        } = updatedTransferData;

        const isAmountChanged =
          oldFromAccountAmount === newFromAccountAmount &&
          oldToAccountAmount === newToAccountAmount;

        const isSendingAccountChanged = oldSendingAccount !== newSendingAccount;
        const isReceivingAccountChanged =
          oldReceivingAccount !== newReceivingAccount;

        if (isAmountChanged) {
          if (isSendingAccountChanged && !isReceivingAccountChanged) {
            const oldSendAccount = await updateAccountBalance(
              oldSendingAccount,
              'DEPOSIT',
              oldFromAccountAmount,
              tx,
            );

            const newSendAccount = await updateAccountBalance(
              newSendingAccount,
              'WITHDRAWAL',
              newFromAccountAmount,
              tx,
            );
          }

          if (!isSendingAccountChanged && isReceivingAccountChanged) {
            const oldResAccount = await updateAccountBalance(
              oldReceivingAccount,
              'WITHDRAWAL',
              oldToAccountAmount,
              tx,
            );

            const newResAccount = await updateAccountBalance(
              newReceivingAccount,
              'DEPOSIT',
              newToAccountAmount,
              tx,
            );
          }
        } else {
          if (!isSendingAccountChanged && !isReceivingAccountChanged) {
            // *    if(A same & B same) {
            // *        1. A.balance + oldAmount - newAmount
            // *        2. B.balance - oldAmount + newAmount
            // *    }
            // *
            const oldSendAccount = await updateAccountBalance(
              oldSendingAccount,
              'WITHDRAWAL',
              oldFromAccountAmount + newFromAccountAmount,
              tx,
            );
            const oldResAccount = await updateAccountBalance(
              oldReceivingAccount,
              'DEPOSIT',
              oldFromAccountAmount - newFromAccountAmount,
              tx,
            );
          }

          if (isSendingAccountChanged && !isReceivingAccountChanged) {
            // *    if(A changed, B same) {
            // *        1. rollback A.balance (+ oldAmount)
            // *        2. new A.balance - newAmount
            // *        3. update B.balance - oldAmount + newAmount
            // *    }
            // *

            const oldSendAccount = await updateAccountBalance(
              oldSendingAccount,
              'DEPOSIT',
              oldFromAccountAmount,
              tx,
            );

            const newSendAccount = await updateAccountBalance(
              newSendingAccount,
              'WITHDRAWAL',
              newFromAccountAmount,
              tx,
            );

            const oldResAccount = await updateAccountBalance(
              oldReceivingAccount,
              'WITHDRAWAL',
              oldToAccountAmount + newToAccountAmount,
              tx,
            );
          }

          if (!isSendingAccountChanged && isReceivingAccountChanged) {
            // *    if(A same, B changed) {
            // *        1. rollback B.balance (- oldAmount)
            // *        2. new B.balance + newAmount
            // *        3. A.balance + oldAmount - newAmount
            // *    }
            const oldResAccount = await updateAccountBalance(
              oldReceivingAccount,
              'WITHDRAWAL',
              oldToAccountAmount,
              tx,
            );

            const newResAccount = await updateAccountBalance(
              newReceivingAccount,
              'DEPOSIT',
              newToAccountAmount,
              tx,
            );

            const oldSendAccount = await updateAccountBalance(
              oldSendingAccount,
              'DEPOSIT',
              oldFromAccountAmount - newFromAccountAmount,
              tx,
            );
          }

          if (isSendingAccountChanged && isReceivingAccountChanged) {
            // *    if(A changed, B changed) {
            // *        1. rollback A.balance (+ oldAmount)
            // *        2. rollback B.balance (- oldAmount)
            // *        3. new A.balance - newAmount
            // *        4. new B.balance + newAmount
            // *    }
            const oldSendAccount = await updateAccountBalance(
              oldSendingAccount,
              'DEPOSIT',
              oldFromAccountAmount,
              tx,
            );

            const oldResAccount = await updateAccountBalance(
              oldReceivingAccount,
              'WITHDRAWAL',
              oldToAccountAmount,
              tx,
            );

            const newSendAccount = await updateAccountBalance(
              newSendingAccount,
              'WITHDRAWAL',
              newFromAccountAmount,
              tx,
            );

            const newResAccount = await updateAccountBalance(
              newReceivingAccount,
              'DEPOSIT',
              newToAccountAmount,
              tx,
            );
          }
        }

        const totalBalance = updateTotalBalance({
          userId: req.user.id,
          reason: 'UPDATE_TRANSACTION',
          updateAmount: updatedTransferData.amount,
          updateCurrency: updatedTransferData.fromAccount.currency,
          transactionId: updatedTransferData.id,
          tx: tx,
        });

        return { transaction: updatedTransferData, totalBalance };
      },
      {
        timeout: 9000,
      },
    );

    res.status(200).json({
      transaction,
      totalBalance,
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
    const { transaction, totalBalance } = await prisma.$transaction(
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

        await updateAccountBalance(
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

        return { transaction: deleteTransaction, totalBalance };
      },
    );

    res.status(200).json({
      transaction,
      totalBalance,
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
    const { transaction, totalBalance } = await prisma.$transaction(
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

        await updateAccountBalance(
          deletedTransaction.fromAccountId,
          'DEPOSIT',
          deletedTransaction.amount,
          tx,
        );
        await updateAccountBalance(
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

        return { transaction: deleteTransaction, totalBalance };
      },
    );

    res.status(200).json({
      transaction,
      totalBalance,
    });
  } catch (error) {
    next(error);
  }
};
