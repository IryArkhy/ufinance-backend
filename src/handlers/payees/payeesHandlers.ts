import { NextFunction, Response } from 'express';
import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { CreatePayeesReqBody } from './types';

export const getPayees = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payees = await prisma.payee.findMany({
      where: {
        userId: req.user.id,
      },
    });

    res.status(200).json({ payees });
  } catch (error) {
    next(error);
  }
};

export const createPayees = async (
  req: RequestWithUser<any, any, CreatePayeesReqBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const payees = await prisma.payee.createMany({
      data: req.body.payees.map(c => ({
        name: c,
        userId: req.user.id,
      })),
    });

    res.status(201).json({ payees });
  } catch (error) {
    next(error);
  }
};

export const deletePayee = async (
  req: RequestWithUser<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const deletePayee = prisma.payee.delete({
      where: {
        id: req.params.id,
      },
    });

    const updateTransactions = prisma.transaction.updateMany({
      where: {
        payeeId: req.params.id,
        userId: req.user.id,
      },
      data: {
        payeeId: null,
      },
    });

    const [deletedPayee] = await prisma.$transaction([
      deletePayee,
      updateTransactions,
    ]);

    res.status(200).json({ deletedPayee });
  } catch (error) {
    next(error);
  }
};
