
export const handleError = (message?: string) => {
  return {
    success: false,
    msg: message,
  };
};
