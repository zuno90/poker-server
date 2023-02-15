import { RESET_CD } from '../game/constants/server-emit.constant';

export const sleep = async (time: number) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(`Sleep for: ${time * 1000}ms`);
    }, time * 1000);
  });
};
