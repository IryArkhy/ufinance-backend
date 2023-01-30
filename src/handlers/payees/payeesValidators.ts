import { body } from 'express-validator';

export const createPayees = [body('payees').isArray({ min: 1 })];
