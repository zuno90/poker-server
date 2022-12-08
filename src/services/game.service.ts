import { User } from "../models/user.model";
import { handleError } from "../utils/handleError";

export const updateChip = async (id: string, chips: number) => {
  try {
    await User.updateOne({ id }, { chips });
  } catch (error) {
    console.error(error);
  }
};
