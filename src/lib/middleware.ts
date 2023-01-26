'use strict';
import { NextFunction, Request, Response } from 'express';
import { validationResult } from 'express-validator';

import { CustomError } from '../types';

import { RequestWithUser } from './auth';

export const handleInputErrors = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const errors = validationResult(req);

  if (!errors.isEmpty()) {
    res.status(400);
    res.json({ errors: errors.array() });
  } else {
    next();
  }
};

export const checkUserRole = (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  if (!req.user || req.user.role !== 'ADMIN') {
    res.status(401);
    res.json({
      message: 'No sufficient permissions.',
    });
  } else {
    next();
  }
};

export const catchError = (
  err: CustomError | Error,
  _: Request,
  res: Response,
  __: NextFunction,
) => {
  if (err instanceof CustomError) {
    if (err.type === 'auth') {
      return res.status(401).json({
        message: `Insufficient permissions. ${err.message}`,
      });
    } else if (err.type === 'input') {
      return res.status(400).json({
        message: `Invalid input. ${err.message}`,
      });
    } else if (err.type === 'custom') {
      return res.status(err.statusCode ?? 500).json({
        message: err.message,
      });
    }
  }

  res.status(500).json({
    message: `Error: ${err.message}`,
  });
};

export const errorLogger = (
  error: Error | CustomError,
  req: Request,
  __: Response,
  next: NextFunction,
) => {
  console.log({ ERROR_logger: error });
  console.log({ body: JSON.stringify(req.body) });
  next(error);
};

// Fallback Middleware function for returning
// 404 error for undefined paths
export const invalidPathHandler = (_: Request, res: Response) => {
  res.status(404);
  res.json({ message: 'Invalid path' });
};
