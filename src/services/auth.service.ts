import { Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model";
import { ObjectId } from "mongoose";
import { handleError } from "../util/handleError";

export const signupService = async (data: any, res: Response) => {
  try {
    const { type, payload } = data;
    if (type !== "normal")
      throw new Error("Credential is not available for Account Sign Up!");
    const { username, password } = payload;
    const existedUser = await User.findOne({ username, loginType: type });
    if (existedUser) throw new Error("User name is existing!");
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await new User({
      username,
      password: hashedPassword,
      status: "active",
      loginType: type,
    }).save();

    return res.status(200).json({
      success: true,
      msg: "Successfully Created new user!",
      data: newUser,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(400).json(handleError(error.message));
  }
};

export const signinService = async (data: any, res: Response) => {
  let user;
  let accessToken;
  const { type, payload } = data;
  try {
    switch (type) {
      // username + pass login
      case "normal":
        const { username, password } = payload;
        const existedUser = await User.findOne({ username, loginType: type });
        if (!existedUser) throw new Error("User is not existing!");
        const isMatchPassword = await bcrypt.compare(
          password,
          existedUser.password
        );
        if (!isMatchPassword) throw new Error("Password is not correct");
        user = existedUser;
        accessToken = jwt.sign(
          { id: existedUser.id, username: existedUser.username },
          `${process.env.JWT_SECRET}`,
          { expiresIn: "1d" }
        );
        accessToken = jwt.sign(
          { id: existedUser.id, username: existedUser.username },
          `${process.env.JWT_SECRET}`,
          { expiresIn: "1d" }
        );
        break;
      // fb login
      case "facebook":
        const { fbEmail, fbName, fbAvatar } = payload;
        const fbUser = await User.findOne({ email: fbEmail, loginType: type });
        if (fbUser) {
          user = fbUser;
        } else {
          user = await new User({
            email: fbEmail,
            name: fbName,
            status: "active",
            loginType: type,
            avatar: fbAvatar,
          }).save();
        }
        accessToken = jwt.sign(
          { id: user.id, email: user.email },
          `${process.env.JWT_SECRET}`,
          { expiresIn: "1d" }
        );
        break;
      // gg login
      case "google":
        const { ggEmail, ggName, ggAvatar } = payload;
        const ggUser = await User.findOne({ email: ggEmail, loginType: type });
        console.log(ggUser);
        if (ggUser) {
          user = ggUser;
        } else {
          user = await new User({
            email: ggEmail,
            name: ggName,
            status: "active",
            loginType: type,
            avatar: ggAvatar,
          }).save();
        }
        accessToken = jwt.sign(
          { id: user.id, email: user.email },
          `${process.env.JWT_SECRET}`,
          { expiresIn: "1d" }
        );
        break;
      default:
        break;
    }
    return res.status(200).json({
      success: true,
      msg: "Login successfully!",
      accessToken,
    });
  } catch (error: any) {
    console.error(error);
    return res.status(403).json(handleError(error.message));
  }
};

export const signoutService = async (id: ObjectId, res: Response) => {
  try {
  } catch (error: any) {
    console.error(error);
    return res.status(400).json(handleError(error.message));
  }
};
//   // const { email, password } = data;
//   try {
//     // const existedUser = await User.findOne({ email });
//     // if (!existedUser) throw new Error("Email is not existing!");
//     const pw = "111111";
//     const passwordValidation: boolean = await bcrypt.compare(pw, "123456");
//     if (!passwordValidation) throw new Error("You input wrong password!");
//     const accessToken = jwt.sign(
//       {
//         id: existedUser.id,
//         email: existedUser.email,
//         name: existedUser.name,
//       },
//       `${process.env.JWT_SECRET}`,
//       { expiresIn: "24h" }
//     );

//     return {
//       success: true,
//       msg: "Login successfully!",
//       data: accessToken,
//     };
//   } catch (error) {
//     console.error(error);
//   }
// };
