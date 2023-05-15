import amqplib, { Channel, Connection } from 'amqplib';

let ProducerChannel: Channel, ConsumerChannel: Channel, connection: Connection;

const initQueue = async () => {
  try {
    const amqpServer =
      process.env.NODE_ENV === 'production' ? `${process.env.RMQ_URI}` : 'amqp://localhost:5672';

    connection = await amqplib.connect(amqpServer);

    console.log('rabbitMQ is running on PORT 5672');
  } catch (error) {
    console.error(error);
  }
};

export const sendQueue = async (queue: string, data: any) => {
  await initQueue();
  ProducerChannel = await connection.createChannel();

  // make sure that the order channel is created, if not this statement will create it
  await ProducerChannel.assertQueue(queue);
  // send data to queue
  ProducerChannel.sendToQueue(queue, Buffer.from(JSON.stringify(data)), { persistent: true });
};

export const consumeQueue = async (queue: string) => {
  await initQueue();
  ConsumerChannel = await connection.createChannel();

  // make sure that the order channel is created, if not this statement will create it
  await ConsumerChannel.assertQueue(queue);
  ConsumerChannel.consume(
    queue,
    (data: any) => {
      console.log(`data:::::${Buffer.from(data.content)}`);
    },
    { noAck: true },
  );
};

// export const closeQueue = async () => {
//   // close the channel and connection
//   await channel.close();
//   await connection.close();
// };
