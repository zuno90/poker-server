import mongoose from "mongoose";

const initDatabase = async () => {
  const uri = `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`;
  try {
    await mongoose.connect(uri, {
      auth: {
        username: process.env.MONGO_USERNAME,
        password: process.env.MONGO_PASSWORD,
      },
      authSource: "admin",
      dbName: process.env.MONGO_DATABASE_NAME,
    });
    console.log(
      "⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️ Connect to MONGODB inside docker ⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️⚡️"
    );
  } catch (error) {
    console.error(error);
    // process.exit(1);
  }
};

export default initDatabase;
