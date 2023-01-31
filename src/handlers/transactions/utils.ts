import { Prisma } from '@prisma/client';
import { updateTotalBalance } from '../../lib/balance';
import { DepositWithdrawalReqBody } from './types';

export const createNewTransaction = async (
  data: DepositWithdrawalReqBody,
  userId: string,
  tx: Prisma.TransactionClient,
) => {
  const {
    tagNames,
    transactionType,
    fromAccountId,
    amount,
    date,
    description,
    payeeId,
    categoryId,
  } = data;

  const tagsResult = await Promise.all(
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
  );

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
      tags: {
        createMany: {
          data: tagsResult.map(tag => ({ tagId: tag.id })),
        },
      },
    },
  });
  const accountWithUpdatedBalance = await tx.account.update({
    where: {
      id: fromAccountId,
    },
    data: {
      balance: {
        decrement: transactionType === 'WITHDRAWAL' ? amount : 0,
        increment: transactionType === 'WITHDRAWAL' ? 0 : amount,
      },
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
