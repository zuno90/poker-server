import { Response } from "express";
import { User } from "../models/user.model";
import { handleError } from "../util/handleError";

export const userInfoService = async (user: any, res: Response) => {
  try {
    const { id, email, username } = user;
    console.log(user);
    const userInfo = await User.findOne({ id, email, username });
    if (!userInfo) throw new Error("User is not existing!");
    return res.status(200).json({ success: true, data: userInfo });
  } catch (error: any) {
    console.error(error);
    return res.status(400).json(handleError(error.message));
  }
};
