import { Router } from 'express';

import {
  catchError,
  errorLogger,
  handleInputErrors,
  invalidPathHandler,
} from './lib/middleware';
import { userHandlers, userValidators } from './handlers/users';
import { accountHandlers, accountValidators } from './handlers/accounts';
import {
  categoriesHandlers,
  categoriesValidators,
} from './handlers/categories';
import { payeesHandlers, payeesValidators } from './handlers/payees';
import { tagsHandlers, tagsValidators } from './handlers/tags';
import {
  transactionHandlers,
  transactionValidators,
} from './handlers/transactions';
import { insightsHandlers } from './handlers/insights';

const router = Router();

/**
 * Users
 */
router.get('/user', userHandlers.getUser);
router.patch(
  '/user/password',
  userValidators.updateUserPassword,
  handleInputErrors,
  userHandlers.updatePassword,
);

/**
 * Accounts
 */

router.get('/accounts', accountHandlers.getAccounts);
router.post(
  '/accounts',
  accountValidators.createAccount,
  handleInputErrors,
  accountHandlers.createAccount,
);
router.patch(
  '/accounts/:id',
  accountValidators.updateAccount,
  handleInputErrors,
  accountHandlers.updateAccount,
);
router.delete('/accounts/:id', accountHandlers.deleteAccount);

/**
 * Transactions
 */

router.get(
  '/transactions/:accountId',
  transactionHandlers.getTransactionsByAccount,
);
router.post(
  '/transactions',
  transactionValidators.createTransaction,
  handleInputErrors,
  transactionHandlers.createTransaction,
);
router.post(
  '/transactions/transfer',
  transactionValidators.createTransfer,
  handleInputErrors,
  transactionHandlers.createTransfer,
);
router.put(
  '/transactions/:id',
  transactionValidators.updateTransaction,
  handleInputErrors,
  transactionHandlers.updateTransaction,
);
router.put(
  '/transactions/transfer/:id',
  transactionValidators.updateTransfer,
  handleInputErrors,
  transactionHandlers.updateTransfer,
);
router.delete(
  '/transactions/:accountId/:id',
  transactionHandlers.deleteTransaction,
);
router.delete(
  '/transactions/transfer/:accountId/:id',
  transactionHandlers.deleteTransfer,
);

/**
 * Categories
 */

router.get('/categories', categoriesHandlers.getCategories);
router.post(
  '/categories',
  categoriesValidators.createCategories,
  handleInputErrors,
  categoriesHandlers.createCategory,
);
router.delete('/categories/:id', categoriesHandlers.deleteCategories);

/**
 * Payees
 */

router.get('/payees', payeesHandlers.getPayees);
router.post(
  '/payees',
  payeesValidators.createPayees,
  handleInputErrors,
  payeesHandlers.createPayees,
);
router.delete('/payees/:id', payeesHandlers.deletePayee);

/**
 * Tags
 */

router.get('/tags', tagsHandlers.getTags);
router.post('/tags', tagsValidators.createTags, tagsHandlers.createTags);
router.delete('/tags/:id', tagsHandlers.deleteTag);

/**
 * Insights
 */
router.get('/insights/balance', insightsHandlers.getUserBalance);
router.get('/insights/currentMonth/overview', insightsHandlers.getOverview);
router.get(
  '/insights/currentMonth/statistics',
  insightsHandlers.getCurrentMonthsStats,
);
router.get(
  '/insights/currentMonth/transactions',
  insightsHandlers.getCurrentMonthRecentTransactions,
);

router.use(errorLogger);
router.use(invalidPathHandler);
router.use(catchError);

export default router;
