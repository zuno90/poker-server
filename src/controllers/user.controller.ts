import { Request, Response } from "express";
import { userInfoService } from "../services/user.service";

export const getUserInfo = async (req: Request, res: Response) => {
  userInfoService(req.user, res);
};
