import { Request, Response } from "express";

export const getUsers = async (req: Request, res: Response) => {
  res.send("get all users");
};

export const getUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  console.log(id);
};
