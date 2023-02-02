import { body } from 'express-validator';
import { TRANSACTION_TYPES } from './types';

export const getTransactionsByAccount = [
  body('offset').isInt(),
  body('limit').optional().isInt(),
];

export const createTransaction = [
  body('fromAccountId').isString(),
  body('amount').isFloat().toFloat(),
  body('date').isString(),
  body('transactionType').isIn(TRANSACTION_TYPES.filter(i => i !== 'TRANSFER')),
  body('description').optional().isString(),
  body('categorId').optional().isString(),
  body('payeeId').optional().isString(),
  body('tagNames').optional().isArray({ min: 1 }),
  body('toAccountId').optional().isString(),
];

export const createTransfer = [
  body('fromAccountId').isString(),
  body('toAccountId').isString(),
  body('fromAccountAmount').isFloat().toFloat(),
  body('toAccountAmount').isFloat().toFloat(),
  body('date').isString(),
  body('description').optional().isString(),
];

export const updateTransaction = createTransaction;
export const updateTransfer = createTransfer;
