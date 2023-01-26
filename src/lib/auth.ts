import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcrypt';

import type { ROLES as PrismaRole } from '.prisma/client';

import config from '../config';
import { prisma } from '../db';

type JWTUserInfo = {
  role: PrismaRole;
  id: string;
};

export type RequestWithUser<
  P = Record<string, any>,
  ResBody = any,
  ReqBody = any,
  ReqQuery = qs.ParsedQs,
  Locals extends Record<string, any> = Record<string, any>,
> = Request<P, ResBody, ReqBody, ReqQuery, Locals> & {
  user: JWTUserInfo;
};

export const createJWT = ({ id, role }: JWTUserInfo): string => {
  const token = jwt.sign({ id, role }, config.secrets.jwt);
  return token;
};

export const protectMiddleware = async (
  req: RequestWithUser,
  res: Response,
  next: NextFunction,
) => {
  const bearer = req.headers.authorization;

  const notifyNotAuthorized = (message: string) => {
    res.status(401);
    res.json({ message });
  };

  if (!bearer) {
    notifyNotAuthorized('Not authorized');
    return;
  }

  const [, token] = bearer.split(' ');

  if (!token) {
    notifyNotAuthorized('Not valid token');
    return;
  }

  try {
    const user = jwt.verify(token, config.secrets.jwt) as JWTUserInfo;

    const userExists = await prisma.user.findFirst({
      where: {
        id: user.id,
      },
    });

    if (userExists) {
      req.user = user;
    } else {
      throw new Error();
    }

    next();
  } catch (e) {
    notifyNotAuthorized('Not valid token');
  }
};

export const hashPassword = (password: string): Promise<string> => {
  return bcrypt.hash(password, 5);
};

export const comparePasswords = (
  password: string,
  hash: string,
): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
