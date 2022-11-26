import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { User } from "../models/user.model";
import { TDecode } from "../types";
import { handleError } from "../utils/handleError";

const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    // getting a token from authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new Error("Unauthorized Header!...");

    const accessToken = authHeader.split("Bearer ")[1];
    if (!accessToken) throw new Error("You need to perform Token!...");

    const decoded = jwt.verify(
      accessToken,
      `${process.env.JWT_SECRET}`
    ) as JwtPayload;

    if (!decoded) throw new Error("Token is invalid!...");
    const { id, email, username } = decoded;

    // check user
    const user = await User.findOne({ id, email, username }, "-password");
    if (!user) throw new Error("You have unauthorized!...");
    // if (user.isLogged)
    //   throw new Error(
    //     "User is logged in another device! Please log out from it first!"
    //   );
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
