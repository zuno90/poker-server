import { Router } from 'express';
import { getUserInfo } from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';

export const userRouter = Router();

userRouter.get('/info', authMiddleware, getUserInfo);
