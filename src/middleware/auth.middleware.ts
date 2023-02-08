import { NextFunction, Request, Response } from 'express';
import { TDecode } from '../types';
import { handleError } from '../utils/handleError';
import { parseUserFromJwt } from '../utils/jwtChecking';

const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // getting a token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) throw Error('Unauthorized Header!...');

    const accessToken = authHeader.split('Bearer ')[1];
    if (!accessToken) throw Error('You need to perform Token!...');

    const user = await parseUserFromJwt(accessToken);

    req.user = <TDecode>{
      id: user.id,
      email: user.email,
      username: user.username,
    };

    next();
  } catch (error: any) {
    res.status(401).json(handleError(error.message));
  }
};

export default authMiddleware;
