// src/utils/rabbitmq.js
import amqp from 'amqplib';

let connection = null;
let channel = null;

const {
  RABBITMQ_USER = 'guest',
  RABBITMQ_PASSWORD = 'test',
  RABBITMQ_HOST = 'localhost',
  RABBITMQ_PORT = '5672',
} = process.env;

if (!RABBITMQ_USER || !RABBITMQ_PASSWORD || !RABBITMQ_HOST || !RABBITMQ_PORT) {
  console.error("❌ [Config] Variables de entorno de RabbitMQ incompletas.");
  process.exit(1);
}

const RABBITMQ_URL = `amqp://${RABBITMQ_USER}:${RABBITMQ_PASSWORD}@${RABBITMQ_HOST}:${RABBITMQ_PORT}`;
/**
 * Conecta a RabbitMQ y retorna un canal, con reintentos en caso de fallo.
 * @param {number} maxRetries - Número máximo de reintentos.
 * @param {number} retryDelay - Tiempo de espera entre reintentos en ms.
 */
export async function connectRabbitMQ(maxRetries = 10, retryDelay = 3000) {
  let retries = 0;

  while (true) {
    try {
      connection = await amqp.connect(RABBITMQ_URL);
      channel = await connection.createChannel();
      console.log('✅ Conectado a RabbitMQ en', RABBITMQ_URL);
      return channel;
    } catch (error) {
      retries++;
      console.warn(`🔄 Error al conectar a RabbitMQ: ${error.message}. Reintento ${retries}/${maxRetries} en ${retryDelay}ms...`);
      if (retries >= maxRetries) {
        console.error('❌ Se excedió el número máximo de reintentos para conectarse a RabbitMQ.');
        process.exit(1);
      }
      // Espera antes de reintentar
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
}

/**
 * Cierra la conexión con RabbitMQ.
 */
export async function closeRabbitMQ() {
  try {
    if (channel) await channel.close();
    if (connection) await connection.close();
    console.log('✅ Conexión a RabbitMQ cerrada');
  } catch (error) {
    console.error('❌ Error al cerrar conexión con RabbitMQ:', error.message);
  }
}
