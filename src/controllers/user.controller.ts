import { Request, Response } from 'express';
import { userInfoService } from '../services/user.service';

export const getUserInfo = async (req: Request, res: Response) => {
  return userInfoService(req.user, res);
};
