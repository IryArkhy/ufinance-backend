import { NextFunction, Response } from 'express';

import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';

export const getUserBalance = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const dateNow = new Date();
    const currentMonth = dateNow.getMonth();
    const currentYear = dateNow.getFullYear();
    const balance = await prisma.userBalance.findFirstOrThrow({
      where: {
        month: currentMonth,
        year: currentYear,
        userId: req.user.id,
      },
    });

    res.status(200).json({ balance });
  } catch (error) {
    next(error);
  }
};
