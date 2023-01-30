import { Prisma } from '@prisma/client';

export const createDefaultCategories = async (
  userId: string,
  prisma: Prisma.TransactionClient,
) => {
  return await prisma.category.createMany({
    data: [
      { name: 'Housing', userId, type: 'DEFAULT' },
      { name: 'Transportation', userId, type: 'DEFAULT' },
      { name: 'Food', userId, type: 'DEFAULT' },
      { name: 'Utilities', userId, type: 'DEFAULT' },
      { name: 'Insurance', userId, type: 'DEFAULT' },
      { name: 'Medical & Healthcare', userId, type: 'DEFAULT' },
      { name: 'Sport', userId, type: 'DEFAULT' },
      { name: 'Beauty', userId, type: 'DEFAULT' },
      { name: 'Personal', userId, type: 'DEFAULT' },
      { name: 'Entertainment', userId, type: 'DEFAULT' },
      { name: 'Family', userId, type: 'DEFAULT' },
      { name: 'Gifts', userId, type: 'DEFAULT' },
      { name: 'Pets', userId, type: 'DEFAULT' },
      { name: 'Education', userId, type: 'DEFAULT' },
      { name: 'Other', userId, type: 'DEFAULT' },
    ],
  });
};
