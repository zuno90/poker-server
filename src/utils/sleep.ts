export const sleep = async (time: number) => {
  return new Promise(resolve => {
    setTimeout(() => {
      resolve(`Slept for: ${time * 1000}ms`);
    }, time * 1000);
  });
};
