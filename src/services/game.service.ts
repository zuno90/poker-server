import { User } from '../models/user.model';

export const updateChip = async (_id: string, chips: number) => {
  try {
    await User.updateOne({ _id }, { chips });
  } catch (error) {
    console.error(error);
  }
};
