import { body } from 'express-validator';

export const createCategories = [
  body('categories').isArray({ min: 1 }),
  body('isDefault').optional().isBoolean(),
];
