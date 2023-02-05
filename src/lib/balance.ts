import {
  Prisma,
  BALANCE_UPDATE_REASON as BalanceUpdateReason,
  CURRENCY as Currency,
  UserBalance,
} from '@prisma/client';
import { convertToUSD } from './currencyApi';

type UpdateAccountData = {
  userId: string;
  reason: BalanceUpdateReason;
  updateAmount: number;
  updateCurrency: Currency;
  tx: Prisma.TransactionClient;
  accountId?: string;
  transactionId?: string;
};
/**
 *
 * @param userId current user ID
 * @param reason balance update reason
 * @param updateAmount the amount of the update
 * @param updateCurrency the currency of the amount
 * @param tx  Prisma Transaction Client
 * @param accountId
 */
export const updateTotalBalance = async (
  data: UpdateAccountData,
): Promise<UserBalance> => {
  const {
    userId,
    reason,
    updateAmount,
    updateCurrency,
    tx,
    accountId,
    transactionId,
  } = data;

  const dateNow = new Date();
  const currentMonth = dateNow.getMonth();
  const currentYear = dateNow.getFullYear();

  const allAccounts = await tx.account.findMany({
    where: {
      userId,
    },
    select: {
      id: true,
      balance: true,
      currency: true,
      userId: true,
    },
  });

  const convertedBalances = await Promise.all(
    allAccounts
      .filter(a => a.balance > 0)
      .map(account => convertToUSD(account.currency, account.balance)),
  );

  if (convertedBalances.includes(null)) {
    throw new Error('Failed to convert acounts balances');
  }

  const totalBalanceInUsd = convertedBalances.reduce(
    (balance, res) => (balance += res.data.USD.value),
    0,
  );

  const userBalance = await tx.userBalance.upsert({
    where: {
      BalanceUpdateIdentifier: {
        userId: userId,
        year: currentYear,
        month: currentMonth,
      },
    },
    create: {
      userId,
      year: currentYear,
      month: currentMonth,
      currency: 'USD',
      balance: totalBalanceInUsd,
      updateEvent: {
        create: {
          reason: reason,
          totalBalance: totalBalanceInUsd,
          updateAmount: updateAmount,
          updateCurrency: updateCurrency,
          accountId,
          transactionId,
        },
      },
    },
    update: {
      balance: totalBalanceInUsd,
      updateEvent: {
        create: {
          reason: reason,
          totalBalance: totalBalanceInUsd,
          updateAmount: updateAmount,
          updateCurrency: updateCurrency,
          accountId,
          transactionId,
        },
      },
    },
  });

  return userBalance;
};
