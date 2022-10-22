import { Router } from "express";
import { getUsers, getUser } from "../controllers/user.controller";
import authMiddleware from "../middleware/auth.middleware";

export const userRouter = Router();

userRouter.get("/", getUsers);
userRouter.get("/:id", authMiddleware, getUser);
// userRouter.get("/:id", getUser);
