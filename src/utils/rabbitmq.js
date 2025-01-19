import amqp from 'amqplib';
import dotenv from 'dotenv';

dotenv.config();

let connection = null;
let channel = null;

export async function connectRabbitMQ() {
  if (connection) return channel;

  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || '5672';
  const user = process.env.RABBITMQ_USER || 'guest';
  const pass = process.env.RABBITMQ_PASS || 'guest';

  const amqpUrl = `amqp://${user}:${pass}@${host}:${port}`;

  try {
    connection = await amqp.connect(amqpUrl);
    channel = await connection.createChannel();
    return channel;
  } catch (error) {
    console.error('❌ Error al conectar a RabbitMQ:', error.message);
    process.exit(1);
  }
}
