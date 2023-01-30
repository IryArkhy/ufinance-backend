import { Router } from 'express';

import {
  catchError,
  checkUserRole,
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

router.get('/transactions/:accountId');
router.post('/transactions'); //Update balance
router.patch('/transactions/:accountId/:id'); //Update balance
router.delete('/transactions/:accountId/:id'); //Update balance

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
router.get('/insights/balance');
router.get('/insights/currentMonth/balance');
router.get('/insights/currentMonth/overview');
router.get('/insights/currentMonth/statistics');
router.get('/insights/currentMonth/transactions');

router.use(errorLogger);
router.use(invalidPathHandler);
router.use(catchError);

export default router;
