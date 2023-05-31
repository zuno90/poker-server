import Redis from 'ioredis';

const redisUri =
  process.env.NODE_ENV === 'production' ? `${process.env.REDIS_URL}` : `localhost:6379`;

const redisMaster = new Redis(redisUri);
const redisPub = new Redis(redisUri);
const redisSub = new Redis(redisUri);

const initRedis = async () => {
  try {
    const ping = await redisMaster.ping();
    console.log(ping);
  } catch (err) {
    console.error(err);
  }
};

export { redisMaster, redisPub, redisSub, initRedis };
