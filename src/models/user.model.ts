import { model, Schema } from "mongoose";

const UserModel: Schema = new Schema(
  {
    username: { type: String, unique: true },
    password: { type: String },
    email: { type: String, unique: true },
    name: { type: String },
    status: { type: String, required: true, enum: ["active", "inactive"] },
    chips: { type: Number, default: 10000 },
    loginType: {
      type: String,
      required: true,
      enum: ["normal", "facebook", "google"],
      index: true,
    },
    avatar: { type: String, default: "./user.png" },
  },
  { timestamps: true }
);

export const User = model("user", UserModel);
