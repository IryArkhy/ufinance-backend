import { PrismaClientKnownRequestError } from '@prisma/client/runtime';
import { NextFunction, Request, Response } from 'express';

import { prisma } from '../../db';
import {
  comparePasswords,
  createJWT,
  hashPassword,
  RequestWithUser,
} from '../../lib/auth';
import { createDefaultCategories } from '../../lib/categories';
import { CustomError, PrismaClientErrorCodes } from '../../types';

import {
  CreateUserRequestBody,
  SignInRequestBody,
  UpdatePasswordReqBody,
} from './types';

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

    const user = await prisma.$transaction(async tx => {
      const newUser = await tx.user.create({
        data: userData,
      });

      await createDefaultCategories(newUser.id, tx);

      const dateNow = new Date();
      const currentMonth = dateNow.getMonth();
      const currentYear = dateNow.getFullYear();

      await tx.userBalance.create({
        data: {
          month: currentMonth,
          year: currentYear,
          userId: newUser.id,
        },
      });

      return newUser;
    });

    const token = createJWT({ id: user.id, role: user.role });

    res.status(201);
    res.json({ token, user });
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
      user,
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

export const updatePassword = async (
  req: RequestWithUser<any, any, UpdatePasswordReqBody>,
  res: Response,
  next: NextFunction,
) => {
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: req.user.id,
      },
    });

    const isValid = await comparePasswords(req.body.oldPassword, user.password);

    if (!isValid) {
      return res.status(401).json({ message: 'Validation error.' });
    }

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: await hashPassword(req.body.newPassword),
      },
    });
    const token = createJWT({ id: user.id, role: user.role });

    res.status(200).json({
      message: 'Password is updated',
      token,
    });
  } catch (error) {
    next(error);
  }
};
