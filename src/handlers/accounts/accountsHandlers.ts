import { Account, Prisma, UserBalance } from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { NextFunction, Response } from 'express';

import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { updateTotalBalance } from '../../lib/balance';
import { CustomError, PrismaClientErrorCodes } from '../../types';

import { CreateAccountRequestBody, UpdateAccountRequestBody } from './types';

export const getAccounts = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const accounts = await prisma.account.findMany({
      where: {
        userId: req.user.id,
      },
    });

    res.status(200).json({ accounts });
  } catch (error) {
    next(error);
  }
};

export const createAccount = async (
  req: RequestWithUser<any, any, CreateAccountRequestBody>,
  res: Response,
  next: NextFunction,
) => {
  const { body } = req;

  // 1. Create a new account
  // 2. Fetch all accounts
  // 4. Convert all accounts balances to USD
  // 5. Find or Create account balance for current months and create BalanceUpdateEvent
  // 7. Return Account & Total Balance

  const dateNow = new Date();
  const currentMonth = dateNow.getMonth();
  const currentYear = dateNow.getFullYear();

  try {
    const { userBalance, newAccount } = await prisma.$transaction<{
      userBalance: UserBalance;
      newAccount: Account;
    }>(
      async (tx: Prisma.TransactionClient) => {
        const newAccount = await tx.account.create({
          data: {
            userId: req.user.id,
            name: body.name,
            balance: body.balance,
            currency: body.currency,
            isCredit: body.isCredit,
            icon: body.icon,
          },
        });

        const userBalance = await updateTotalBalance({
          userId: req.user.id,
          accountId: newAccount.id,
          reason: 'DELETE_ACCONT',
          tx,
          updateAmount: newAccount.balance,
          updateCurrency: newAccount.currency,
        });

        return { userBalance, newAccount };
      },
      {
        timeout: 8000,
      },
    );

    res.status(201);
    res.json({ totalBalance: userBalance, account: newAccount });
  } catch (error) {
    let err: CustomError | Error = error as Error;
    let errorMessage: string = error.message;

    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === PrismaClientErrorCodes.notFoundOperator) {
        errorMessage = JSON.stringify(error.meta);
      }

      err = new CustomError(errorMessage, 'input');
    }
    next(err);
  }
};

export const updateAccount = async (
  req: RequestWithUser<{ id: string }, any, UpdateAccountRequestBody>,
  res: Response,
  next: NextFunction,
) => {
  const { body, params } = req;
  const { name, icon, isCredit } = body;

  try {
    const updatedAccount = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const account = await tx.account.update({
          where: {
            id: params.id,
          },
          data: {
            name,
            icon,
            isCredit,
          },
        });

        if (account.balance < 0 && !account.isCredit) {
          throw new Error(
            `Cannot update isCredit: Account ${account.name} has negative balance.`,
          );
        }

        return account;
      },
    );

    res.status(200).json({ account: updatedAccount });
  } catch (error) {
    let err: CustomError | Error = error as Error;
    let errorMessage: string = error.message;

    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === PrismaClientErrorCodes.notFoundOperator) {
        errorMessage = JSON.stringify(error.meta);
      }

      err = new CustomError(errorMessage, 'input');
    }
    next(err);
  }
};

export const deleteAccount = async (
  req: RequestWithUser<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  const { params } = req;
  try {
    const dateNow = new Date();
    const currentMonth = dateNow.getMonth();
    const currentYear = dateNow.getFullYear();

    const { userBalance, deletedAccount } = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        await tx.account.update({
          where: {
            id: params.id,
          },

          data: {
            fromAccount: {
              deleteMany: {},
            },
          },
        });

        const account = await tx.account.delete({
          where: {
            id: params.id,
          },
        });

        const userBalance = await updateTotalBalance({
          userId: req.user.id,
          accountId: account.id,
          reason: 'DELETE_ACCONT',
          tx,
          updateAmount: account.balance,
          updateCurrency: account.currency,
        });

        return { deletedAccount: account, userBalance };
      },
    );

    res.status(200).json({ deletedAccount, userBalance });
  } catch (error) {
    let err: CustomError | Error = error as Error;
    let errorMessage: string = error.message;

    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === PrismaClientErrorCodes.notFoundOperator) {
        errorMessage = JSON.stringify(error.meta);
      }

      err = new CustomError(errorMessage, 'input');
    }
    next(err);
  }
};
