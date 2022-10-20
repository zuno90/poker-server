import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload, Secret } from "jsonwebtoken";
import { User } from "../models/user.model";

type TDecode = {
  id: string;
  email: string;
};

interface IExtendRequest extends Request {
  user: TDecode;
}

const authMiddleware = async (
  req: IExtendRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // getting a token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Not authen!...");

    const accessToken = authHeader.split("Bearer ")[1];
    if (!accessToken) throw new Error("You need to perform Token!...");

    const decoded = jwt.verify(
      accessToken,
      process.env.SECRET as Secret
    ) as JwtPayload;
    if (!decoded) throw new Error("You have no authorization!...");

    // check user
    const user = await User.findOne({
      _id: decoded.id,
      email: decoded.email,
    });
    if (!user) throw new Error("You need to admin access...");

    req.user = { id: decoded.id, email: decoded.email };
    return next();
  } catch (error: any) {
    console.log(error.message);
    return {
      success: false,
      msg: error.message,
    };
  }
};

export default authMiddleware;
