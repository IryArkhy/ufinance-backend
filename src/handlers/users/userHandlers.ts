import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { NextFunction, Request, Response } from 'express';
import { userHandlers } from '.';

import { prisma } from '../../db';
import {
  comparePasswords,
  createJWT,
  hashPassword,
  RequestWithUser,
} from '../../lib/auth';
import { CustomError, PrismaClientErrorCodes } from '../../types';

import { CreateUserRequestBody, SignInRequestBody } from './types';

export const createNewUser = async (
  req: Request<never, never, CreateUserRequestBody, never>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { body } = req;

    const userData: CreateUserRequestBody = {
      username: body.username,
      email: body.email,
      role: body.role,
      password: await hashPassword(body.password),
    };

    if (body.role) {
      userData.role = body.role;
    }

    const user = await prisma.user.create({
      data: userData,
    });

    const token = createJWT({ id: user.id, role: user.role });

    res.status(201);
    res.json({ token });
  } catch (error) {
    let err: CustomError | Error = error;
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === PrismaClientErrorCodes.uniqueConstraint) {
        const metaString = error.meta
          ? `Check these fields: ${JSON.stringify(error.meta)}`
          : '';

        err = new CustomError(
          `Error: User with such credentials already exist. ${metaString}`,
          'custom',
          400,
        );
      }
    }
    next(err);
  }
};

export const signIn = async (
  req: Request<any, any, SignInRequestBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { body } = req;

    const user = await prisma.user.findUniqueOrThrow({
      where: {
        email: body.email,
      },
    });

    const isValid = await comparePasswords(body.password, user.password);

    if (!isValid) {
      return res.status(401).json({ message: 'Credentials are not valid' });
    }

    const token = createJWT({ id: user.id, role: user.role });

    res.status(200).json({
      token,
    });
  } catch (error) {
    next(error);
  }
};

export const getUsers = async (
  req: RequestWithUser<any, any, any, { offset?: string; limit?: string }>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { query } = req;
    const { offset = 0, limit = 20 } = query;

    const users = await prisma.user.findMany({
      skip: +offset,
      take: +limit,
      orderBy: {
        createdAt: 'desc',
      },
      select: {
        id: true,
        username: true,
        email: true,
        createdAt: true,
      },
    });

    const count = await prisma.user.count();

    res.status(200);
    const newOffset = +offset + +limit;

    res.json({
      users,
      count: count,
      limit,
      offset: newOffset === count ? null : newOffset,
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: req.user.id,
      },
    });

    const { password, ...rest } = user;

    res.status(200).json({ user: rest });
  } catch (error) {
    next(error);
  }
};
