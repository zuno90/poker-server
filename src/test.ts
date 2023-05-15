import { consumeQueue } from './game/init/rabbitmq.init';

async function consume() {
  await consumeQueue('history');
}

consume();
