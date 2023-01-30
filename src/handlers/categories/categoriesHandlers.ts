import { NextFunction, Response } from 'express';
import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { CreateCategoriesReqBody } from './types';

export const getCategories = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const categories = await prisma.category.findMany({
      where: {
        userId: req.user.id,
      },
    });

    res.status(200).json({ categories });
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (
  req: RequestWithUser<any, any, CreateCategoriesReqBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const categories = await prisma.category.createMany({
      data: req.body.categories.map(c => ({
        name: c,
        userId: req.user.id,
        type: req.body.isDefault ? 'DEFAULT' : 'CUSTOM',
      })),
    });

    res.status(201).json({ categories });
  } catch (error) {
    next(error);
  }
};

export const deleteCategories = async (
  req: RequestWithUser<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const deleteCategory = prisma.category.delete({
      where: {
        id: req.params.id,
      },
    });

    const updateTransactions = prisma.transaction.updateMany({
      where: {
        categoryId: req.params.id,
        userId: req.user.id,
      },
      data: {
        categoryId: null,
      },
    });

    const [deletedCategory] = await prisma.$transaction([
      deleteCategory,
      updateTransactions,
    ]);

    res.status(200).json({ deletedCategory });
  } catch (error) {
    next(error);
  }
};
