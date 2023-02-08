import { Request, Response } from 'express';
import { signupService, signinService, signoutService } from '../services/auth.service';

export const SignUp = async (req: Request, res: Response) => {
  return signupService(req.body, res);
};

export const SignIn = (req: Request, res: Response) => {

  return signinService(req.body, res);
};

export const SignOut = async (req: Request, res: Response) => {
  return signoutService(req.body.id, res);
};
