import { Response } from "express";
import { User } from "../models/user.model";
import { handleError } from "../util/handleError";

export const userService = async (_id: string, res: Response) => {
  try {
    const user = await User.findOne({ _id });
    console.log(user)
  } catch (error: any) {
    console.error(error);
    return res.status(400).json(handleError(error.message));
  }
};
