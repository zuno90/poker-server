import { User } from "../models/user.model";

export const updateChip = async (id: string, chips: number) => {
  try {
    console.log({ id, chips });
    await User.updateOne({ id }, { chips });
  } catch (error) {
    console.error(error);
  }
};
