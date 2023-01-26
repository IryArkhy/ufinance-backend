import { body, oneOf } from 'express-validator';

export const createUser = [
  body('email').isEmail(),
  body('password').isStrongPassword(),
  body('username').isString(),
  body('role').optional().isIn(['BASIC', 'ADMIN']),
];

export const signIn = [body('email').isEmail(), body('password').isString()];
