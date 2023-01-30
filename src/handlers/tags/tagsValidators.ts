import { body } from 'express-validator';

export const createTags = [body('tags').isArray({ min: 1 })];
