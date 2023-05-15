import amqplib, { Channel, Connection } from 'amqplib';

let channel: Channel, connection: Connection;

export const initQueue = async (chann: string) => {
  try {
    const amqpServer =
      process.env.NODE_ENV === 'production' ? `${process.env.RMQ_URI}` : 'amqp://localhost:5672';

    connection = await amqplib.connect(amqpServer);
    channel = await connection.createChannel();

    // make sure that the order channel is created, if not this statement will create it
    await channel.assertQueue(chann);

    console.log('rabbitMQ is running on PORT 5672');
  } catch (error) {
    console.error(error);
  }
};

export const sendQueue = async (queue: string, data: any) => {
  // send data to queue
  channel.sendToQueue(queue, Buffer.from(JSON.stringify(data)));
};

export const consumeQueue = async (chann: string) => {
  channel.consume(chann, (data: any) => {
    console.log(`data:::::${Buffer.from(data.content)}`);
    channel.ack(data);
  });
};

export const closeQueue = async () => {
  // close the channel and connection
  await channel.close();
  await connection.close();
};
