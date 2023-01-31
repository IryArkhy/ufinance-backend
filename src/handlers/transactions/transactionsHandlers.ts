import { Account, Prisma, PrismaClient, UserBalance } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { NextFunction, Request, Response } from 'express';
import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { updateTotalBalance } from '../../lib/balance';
import {
  DepositWithdrawalReqBody,
  GetTransactionsByAccountReqBody,
  TransferReqBody,
  UpdateDepositWithdrawalReqBody,
} from './types';
import { createNewTransaction } from './utils';

export const getTransactionsByAccount = async (
  req: RequestWithUser<
    { accountId: string },
    any,
    GetTransactionsByAccountReqBody
  >,
  res: Response,
  next: NextFunction,
) => {
  const { body, params } = req;
  const { offset, limit = 20 } = body;

  try {
    const transactions = await prisma.transaction.findMany({
      skip: offset,
      take: limit,
      orderBy: {
        date: 'desc',
      },
      where: {
        fromAccountId: params.accountId,
      },
      include: {
        tags: true,
      },
    });

    const count = await prisma.transaction.count({
      where: {
        fromAccountId: params.accountId,
      },
    });

    const newOffset = offset + limit;

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

  try {
    const { newTransaction, totalBalance, accountBalance } =
      await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        return await createNewTransaction(req.body, req.user.id, tx);
        // const tagsResult = await Promise.all(
        //   tagNames.map(
        //     async name =>
        //       await tx.tag.upsert({
        //         where: {
        //           TagIdentifier: {
        //             userId: req.user.id,
        //             name,
        //           },
        //         },
        //         create: {
        //           name,
        //           userId: req.user.id,
        //         },
        //         update: {},
        //       }),
        //   ),
        // );

        // const newTransaction = await tx.transaction.create({
        //   data: {
        //     userId: req.user.id,
        //     type: transactionType,
        //     fromAccountId,
        //     amount,
        //     date: new Date(date),
        //     description,
        //     payeeId,
        //     categoryId,
        //     tags: {
        //       createMany: {
        //         data: tagsResult.map(tag => ({ tagId: tag.id })),
        //       },
        //     },
        //   },
        // });
        // const accountWithUpdatedBalance = await tx.account.update({
        //   where: {
        //     id: fromAccountId,
        //   },
        //   data: {
        //     balance: {
        //       decrement: transactionType === 'WITHDRAWAL' ? amount : 0,
        //       increment: transactionType === 'WITHDRAWAL' ? 0 : amount,
        //     },
        //   },
        // });

        // if (
        //   !accountWithUpdatedBalance.isCredit &&
        //   accountWithUpdatedBalance.balance < 0
        // ) {
        //   throw new Error(
        //     'Insufficient balance. Make this account a credit one.',
        //   );
        // }

        // const userBalance = await updateTotalBalance(
        //   req.user.id,
        //   'CREATE_TRANSACTION',
        //   newTransaction.amount,
        //   accountWithUpdatedBalance.currency,
        //   tx,
        //   accountWithUpdatedBalance.id,
        // );

        // return [
        //   newTransaction,
        //   userBalance,
        //   {
        //     accountId: accountWithUpdatedBalance.id,
        //     balance: accountWithUpdatedBalance.balance,
        //   },
        // ];
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
          const isAmountTheSame = transaction.amount === amount;
          const isTransactionTypeSame = transaction.type === transactionType;
          let accountBalanceDelta = 0;

          // 1. Amount same && Transaction Type Same -> do nothing with account
          // 2. Amount changed && Type Same -> calculate difference, update account
          // -> If deposit:
          // newAmount > oldAmount -> balance + (newAmount - oldAmount);
          // newAmount < oldAmount -> balance - (oldAmount - newAmount); 10 | +100 = 110 ; +20: 110 - (100 - 20) = 110 - 80 = 30
          // 120 | -30 = 90. || 120 - 15 = 105
          // -> If withdrawal:
          // newAmount >   ||
          // newAmount <; || 120 | -30 = 90. || 120 - 15 = 105
          // 3. Amount same && Type Changed
          // -> Was deposit: balance - amount * 2;
          // -> Was withdrawal: balance + amount * 2

          // if(!isAmountTheSame) {
          //     accountBalanceDelta = transactionType === "DEPOSIT"
          // }

          const updatedTransaction = await tx.transaction.update({
            where: {
              id: req.params.id,
            },
            data: {},
          });
        }
      },
    );

    res.status(200).json({
      transaction: null,
    });
  } catch (error) {
    next(error);
  }
};

export const updateTransfer = async () => {};

export const deleteTransaction = async () => {};
