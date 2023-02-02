import { body } from 'express-validator';
import { AccountIcons, Currency } from './types';

export const createAccount = [
  body('name').isString(),
  body('balance').isFloat().toFloat(),
  body('isCredit').isBoolean(),
  body('currency').isIn(Currency),
  body('icon').isIn(AccountIcons),
];

export const updateAccount = [
  body('name').isString(),
  body('isCredit').optional().isBoolean(),
  body('icon').optional().isIn(AccountIcons),
];
