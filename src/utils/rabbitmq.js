import amqp from 'amqplib';

let connection = null;
let channel = null;

/**
 * Conecta a RabbitMQ y retorna un canal.
 */
export async function connectRabbitMQ() {
  if (connection) return channel;

  try {
    connection = await amqp.connect('amqp://test:test@localhost');
    channel = await connection.createChannel();
    return channel;
  } catch (error) {
    console.error('❌ Error al conectar a RabbitMQ:', error.message);
    process.exit(1);
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
