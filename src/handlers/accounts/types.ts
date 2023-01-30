import type {
  CURRENCY as PrismaCurrency,
  ACCOUNT_ICON as PrismaAccountIcon,
} from '.prisma/client';

export type CreateAccountRequestBody = {
  name: string;
  balance: number;
  currency: PrismaCurrency;
  isCredit: boolean;
  icon: PrismaAccountIcon;
};

export type UpdateAccountRequestBody = {
  name: string;
  isCredit?: boolean;
  icon: PrismaAccountIcon;
};

export const Currency = ['UAH', 'USD', 'EUR', 'BTC', 'ETH'];

export const AccountIcons = [
  'BANK',
  'CARD',
  'MONEY',
  'BILL',
  'SAVINGS',
  'WALLET',
  'USD',
  'EUR',
  'BTC',
  'PAYMENTS',
  'SHOPPING',
  'TRAVEL',
];
