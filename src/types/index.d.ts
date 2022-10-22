type TDecode = {
  id: ObjectId;
  email?: string;
  username?: string;
};

declare global {
  namespace Express {
    export interface Request {
      user?: TDecode;
    }
  }
}

export {};
