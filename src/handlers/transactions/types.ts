export type TransactionType = 'WITHDRAWAL' | 'DEPOSIT' | 'TRANSFER';
export const TRANSACTION_TYPES = ['WITHDRAWAL', 'DEPOSIT', 'TRANSFER'];

export type DepositWithdrawalReqBody = {
  fromAccountId: string;
  amount: number;
  date: string; // ISOstring;
  transactionType: Exclude<TransactionType, 'TRANSFER'>;
  description?: string;
  categoryId?: string;
  payeeId?: string;
  tagNames?: string[];
};

export type TransferReqBody = {
  fromAccountId: string;
  toAccountId: string;
  fromAccountAmount: number;
  toAccountAmount: number;
  date: string; // ISOstring;
  description?: string;
};

export type UpdateDepositWithdrawalReqBody = DepositWithdrawalReqBody;

export type UpdateTransferReqBody = TransferReqBody;
