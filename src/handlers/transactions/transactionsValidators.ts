import { body } from 'express-validator';
import { TRANSACTION_TYPES } from './types';

export const getTransactionsByAccount = [
  body('offset').isNumeric(),
  body('limit').optional().isNumeric(),
];

export const createTransaction = [
  body('fromAccountId').isString(),
  body('amount').isNumeric(),
  body('date').isString(),
  body('transactionType').isIn(TRANSACTION_TYPES.filter(i => i !== 'TRANSFER')),
  body('description').optional().isString(),
  body('categorId').optional().isString(),
  body('payeeId').optional().isString(),
  body('tagsNames').optional().isArray(),
  body('toAccountId').optional().isString(),
];

export const createTransfer = [
  body('fromAccountId').isString(),
  body('toAccountId').isString(),
  body('fromAccountAmount').isNumeric(),
  body('toAccountAmount').isNumeric(),
  body('date').isString(),
  body('description').optional().isString(),
];

export const updateTransaction = createTransaction;
export const updateTransfer = createTransfer;
