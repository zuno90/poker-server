import { Router } from "express";
import { SignIn, SignUp, SignOut } from "../controllers/auth.controller";
export const authRouter = Router();

authRouter.post("/signup", SignUp);
authRouter.post("/signin", SignIn);
authRouter.post("/signout", SignOut);
