import mongoose from 'mongoose';

const initDatabase = async () => {
  mongoose.set('strictQuery', true);
  try {
    await mongoose.connect(
      `mongodb://${process.env.MONGO_USERNAME}:${process.env.MONGO_PASSWORD}@${process.env.MONGO_HOST}:${process.env.MONGO_PORT}`,
      { dbName: process.env.MONGO_DATABASE_NAME },
    );
    console.log('⚡️⚡️ Connect to MONGODB inside docker ⚡️⚡️');
  } catch (error) {
    console.error(error);
  }
};

export default initDatabase;
