import { Response } from "express";
import bcrypt from "bcrypt";
import { User } from "../models/user.model";
import { ObjectId } from "mongoose";
import { handleError } from "../util/handleError";

export const signupService = async (data: any, res: Response) => {
  try {
    const { type, payload } = data;
    const { username, password } = payload;
    const existedUser = await User.findOne({ username, loginType: type });
    if (existedUser) throw new Error("Email is existing!");
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await new User({
      username,
      password: hashedPassword,
      status: "active",
      loginType: type,
    }).save();

    return {
      success: true,
      msg: "Created new player!",
      data: newUser,
    };
  } catch (error: any) {
    console.error(error);
    return res.status(400).json(handleError(error.message));
  }
};

export const signinService = async (data: any, res: Response) => {
  let user;
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
        break;
      // fb login
      case "facebook":
        const { fbEmail, fbName, fbAvatar } = payload;
        const fbUser = await User.findOne({ fbEmail, loginType: type });
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
        break;
      // gg login
      case "google":
        const { ggEmail, ggName, ggAvatar } = payload;
        console.log(payload);
        const ggUser = await User.findOne({ ggEmail, loginType: type });
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
        break;
      default:
        break;
    }
    // console.log(user);
    return res.status(200).json({
      success: true,
      msg: "Login successfully!",
      data: user,
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

// export const checkService = async (data: any) => {
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
//       `${process.env.SECRET}`,
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
