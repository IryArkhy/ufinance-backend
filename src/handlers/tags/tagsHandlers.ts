import { NextFunction, Response } from 'express';
import { prisma } from '../../db';
import { RequestWithUser } from '../../lib/auth';
import { CreateTagsReqBody } from './types';

export const getTags = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const tags = await prisma.tag.findMany({
      where: {
        userId: req.user.id,
      },
    });

    res.status(200).json({ tags });
  } catch (error) {
    next(error);
  }
};

export const createTags = async (
  req: RequestWithUser<any, any, CreateTagsReqBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    await prisma.tag.createMany({
      data: req.body.tags.map(c => ({
        name: c,
        userId: req.user.id,
      })),
    });

    const tags = await prisma.tag.findMany({
      where: {
        userId: req.user.id,
      },
    });

    res.status(201).json({ tags });
  } catch (error) {
    next(error);
  }
};

export const deleteTag = async (
  req: RequestWithUser<{ id: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const deleteTag = prisma.tag.delete({
      where: {
        id: req.params.id,
      },
    });

    const updateTransactions = prisma.tagOnTransaction.deleteMany({
      where: {
        tagId: req.params.id,
      },
    });

    const [deletedTag] = await prisma.$transaction([
      deleteTag,
      updateTransactions,
    ]);

    res.status(200).json({ deletedTag });
  } catch (error) {
    next(error);
  }
};
