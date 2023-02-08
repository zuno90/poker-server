import jwt, { JwtPayload } from 'jsonwebtoken';
import { User } from '../models/user.model';

export const parseUserFromJwt = async (accessToken: string) => {
  const decoded = jwt.verify(accessToken, `${process.env.JWT_SECRET}`) as JwtPayload;
  if (!decoded) throw new Error('Token is invalid!...');
  const { id, email, username } = decoded;

  // check user
  const user = await User.findOne({ id, email, username }, '-password');
  if (!user) throw new Error('You have unauthorized!...');

  return user;
};
