import type { ROLES as PrismaRole } from '.prisma/client';

export type CreateUserRequestBody = {
  email: string;
  username: string;
  password: string;
  role?: PrismaRole;
};

export type SignInRequestBody = {
  email: string;
  password: string;
};
