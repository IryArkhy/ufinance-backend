import { CURRENCY } from '@prisma/client';
import { NextFunction, Response } from 'express';
import { Dictionary, groupBy } from 'lodash';

import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { convertToUAH } from '../../lib/currencyApi';
import { getCurrentMonthStartEndDate } from './utils';

export const getUserBalance = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const dateNow = new Date();
    const currentMonth = dateNow.getMonth();
    const currentYear = dateNow.getFullYear();

    const balance = await prisma.userBalance.findUnique({
      where: {
        BalanceUpdateIdentifier: {
          month: currentMonth,
          year: currentYear,
          userId: req.user.id,
        },
      }
    });

    res.status(200).json({ balance });
  } catch (error) {
    next(error);
  }
};

export const getOverview = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  const { startDate, lastDate } = getCurrentMonthStartEndDate();

  try {
    const transactions = await prisma.transaction.findMany({
      where: {
        AND: [
          { userId: req.user.id },
          {
            date: {
              gte: startDate,
            },
          },
          {
            date: {
              lte: lastDate,
            },
          },
        ],
      },
      include: {
        fromAccount: true,
      },
    });

    const transactionsCount = await prisma.transaction.count({
      where: {
        AND: [
          { userId: req.user.id },
          {
            date: {
              gte: startDate,
            },
          },
          {
            date: {
              lte: lastDate,
            },
          },
        ],
      },
    });

    type Stats = {
      [key in CURRENCY]: {
        totalExpenses: number;
        totalEarnings: number;
      };
    };

    const byCurrency = transactions.reduce((stats, t) => {
      if (t.type === 'TRANSFER') return stats;

      if (!stats[t.fromAccount.currency]) {
        stats[t.fromAccount.currency] = {
          totalEarnings: 0,
          totalExpenses: 0,
        };
      }

      if (t.type === 'WITHDRAWAL') {
        stats[t.fromAccount.currency].totalExpenses += t.amount;
      }

      if (t.type === 'DEPOSIT') {
        stats[t.fromAccount.currency].totalEarnings += t.amount;
      }

      return stats;
    }, {} as Stats);

    const convertedAmmountsToUAH = await Promise.all(
      Object.entries(byCurrency).map(async ([currency, stats]) => {
        const currencyKey = currency as CURRENCY;
        const defaultValue = { data: { UAH: { value: 0 } } };
        const expensesInUAH =
          stats.totalExpenses === 0
            ? defaultValue
            : await convertToUAH(currencyKey, stats.totalExpenses);
        const earningsInUAH =
          stats.totalEarnings === 0
            ? defaultValue
            : await convertToUAH(currencyKey, stats.totalEarnings);

        return {
          expensesInUAH: expensesInUAH.data.UAH.value,
          earningsInUAH: earningsInUAH.data.UAH.value,
        };
      }),
    );

    const totalExpensesAndEarnings = convertedAmmountsToUAH.reduce(
      (stats, i) => {
        stats.earningsInUah += i.earningsInUAH;
        stats.expensesInUah += i.expensesInUAH;
        return stats;
      },
      { expensesInUah: 0, earningsInUah: 0 },
    );

    res.status(200).json({ transactionsCount, totalExpensesAndEarnings });
  } catch (error) {
    next(error);
  }
};

export const getCurrentMonthsStats = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { startDate, lastDate } = getCurrentMonthStartEndDate();

    const balanceChangeEvents = await prisma.balanceUpdateEvent.findMany({
      where: {
        AND: [
          {
            userBalance: {
              userId: req.user.id,
            },
          },
          {
            createdAt: {
              gte: startDate,
            },
          },
          {
            createdAt: {
              lte: lastDate,
            },
          },
        ],
      },
    });
    const balanceData = balanceChangeEvents.reduce(
      (data, event) => {
        data.balance.push(Math.round(event.totalBalance));
        data.date.push(event.createdAt.getTime());
        return data;
      },
      { date: [] as number[], balance: [] as number[] },
    );

    const transactions = await prisma.transaction.findMany({
      where: {
        AND: [
          { userId: req.user.id },
          {
            date: {
              gte: startDate,
            },
          },
          {
            date: {
              lte: lastDate,
            },
          },
        ],
      },
      include: {
        category: true,
      },
    });

    const transactionsByCategory = groupBy(transactions, t =>
      t.category ? t.category.name : 'No category',
    );
    const transactionsByCategoryData = Object.keys(
      transactionsByCategory,
    ).reduce((stats, key) => {
      stats[key] = transactionsByCategory[key].length;
      return stats;
    }, {} as Dictionary<number>);

    res.status(200).json({ balanceData, transactionsByCategoryData });
  } catch (error) {
    next(error);
  }
};

export const getCurrentMonthRecentTransactions = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { startDate, lastDate } = getCurrentMonthStartEndDate();

    const transactions = await prisma.transaction.findMany({
      where: {
        AND: [
          { userId: req.user.id },
          {
            date: {
              gte: startDate,
            },
          },
          {
            date: {
              lte: lastDate,
            },
          },
        ],
      },
      include: {
        category: true,
        fromAccount: true,
        toAccount: true,
      },
      orderBy: {
        date: 'desc',
      },
      take: 10,
    });

    res.status(200).json({ transactions });
  } catch (error) {
    next(error);
  }
};
