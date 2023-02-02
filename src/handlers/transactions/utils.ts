import { Prisma } from '@prisma/client';
import { updateTotalBalance } from '../../lib/balance';
import { DepositWithdrawalReqBody, TransactionType } from './types';

export const createNewTransaction = async (
  data: DepositWithdrawalReqBody,
  userId: string,
  tx: Prisma.TransactionClient,
) => {
  const {
    tagNames = [],
    transactionType,
    fromAccountId,
    amount,
    date,
    description,
    payeeId,
    categoryId,
  } = data;

  const tagsResult = tagNames.length
    ? await Promise.all(
        tagNames.map(
          async name =>
            await tx.tag.upsert({
              where: {
                TagIdentifier: {
                  userId,
                  name,
                },
              },
              create: {
                name,
                userId,
              },
              update: {},
            }),
        ),
      )
    : [];

  const newTransaction = await tx.transaction.create({
    data: {
      userId,
      type: transactionType,
      fromAccountId,
      amount,
      date: new Date(date),
      description,
      payeeId,
      categoryId,
      tags: tagsResult.length
        ? {
            createMany: {
              data: tagsResult.map(tag => ({ tagId: tag.id })),
            },
          }
        : undefined,
    },
    include: {
      tags: {
        include: {
          tag: true,
        },
      },
      category: true,
      payee: true,
    },
  });

  const accountWithUpdatedBalance = await tx.account.update({
    where: {
      id: fromAccountId,
    },
    data: {
      balance:
        transactionType === 'WITHDRAWAL'
          ? { decrement: amount }
          : { increment: amount },
    },
  });

  if (
    !accountWithUpdatedBalance.isCredit &&
    accountWithUpdatedBalance.balance < 0
  ) {
    throw new Error('Insufficient balance. Make this account a credit one.');
  }

  const totalBalance = await updateTotalBalance({
    userId,
    reason: 'CREATE_TRANSACTION',
    updateAmount: newTransaction.amount,
    updateCurrency: accountWithUpdatedBalance.currency,
    tx,
    accountId: accountWithUpdatedBalance.id,
    transactionId: newTransaction.id,
  });

  return {
    newTransaction,
    totalBalance,
    accountBalance: {
      accountId: accountWithUpdatedBalance.id,
      balance: accountWithUpdatedBalance.balance,
    },
  };
};

export const calculateNewAccountBalance = (
  currentBalance: number,
  oldTransaction: {
    type: Exclude<TransactionType, 'TRANSFER'>;
    amount: number;
  },
  updatedTransaction: {
    type: Exclude<TransactionType, 'TRANSFER'>;
    amount: number;
  },
): number => {
  if (
    oldTransaction.type === updatedTransaction.type &&
    oldTransaction.amount !== updatedTransaction.amount
  ) {
    const { amount: oldAmount } = oldTransaction;
    const { amount: newAmount, type } = updatedTransaction;
    return type === 'DEPOSIT'
      ? currentBalance - oldAmount + newAmount
      : currentBalance + oldAmount - newAmount;
  }

  if (
    oldTransaction.type !== updatedTransaction.type &&
    oldTransaction.amount === updatedTransaction.amount
  ) {
    const { type: oldType } = oldTransaction;
    const { amount } = updatedTransaction;

    return oldType === 'DEPOSIT'
      ? currentBalance - amount * 2
      : currentBalance + amount * 2;
  }

  if (
    oldTransaction.type !== updatedTransaction.type &&
    oldTransaction.amount !== updatedTransaction.amount
  ) {
    const { amount: oldAmount, type: oldType } = oldTransaction;
    const { amount: newAmount, type: newType } = updatedTransaction;

    return oldType === 'DEPOSIT'
      ? currentBalance - oldAmount - newAmount
      : currentBalance + oldAmount + newAmount;
  }

  return currentBalance;
};

export const updateAccountBalance = async (
  accountId: string,
  type: Exclude<TransactionType, 'TRANSFER'>,
  amount: number,
  tx: Prisma.TransactionClient,
) => {
  const updatedAccount = await tx.account.update({
    where: {
      id: accountId,
    },
    data: {
      balance:
        type === 'WITHDRAWAL' ? { decrement: amount } : { increment: amount },
    },
  });

  if (updatedAccount.balance < 0 && !updatedAccount.isCredit) {
    throw new Error(
      `Can't apdate account "${updatedAccount.name}". Insufficient balance`,
    );
  }

  return updatedAccount;
};
