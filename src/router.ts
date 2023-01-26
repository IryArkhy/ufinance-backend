import { Router } from 'express';

import {
  catchError,
  checkUserRole,
  errorLogger,
  handleInputErrors,
  invalidPathHandler,
} from './lib/middleware';
import { userHandlers } from './handlers/users';

const router = Router();

router.get('/user', userHandlers.getUser);

router.use(errorLogger);
router.use(invalidPathHandler);
router.use(catchError);

export default router;
