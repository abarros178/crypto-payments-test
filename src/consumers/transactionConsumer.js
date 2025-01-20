import { connectRabbitMQ } from "../utils/rabbitmq.js";
import { waitForQueuesEmpty } from "../utils/waitForQueueEmpty.js";
import {
  updateSeenTxidsFromDB,
  classifyTransactions,
  persistTransactions,
} from "../services/transactionHelpers.js";

/**
 * Inicia un consumidor de RabbitMQ para la cola `transactionsQueue`, gestionando reintentos y cola de mensajes muertos (Dead Letter Queue).
 * 
 * Este consumidor procesa mensajes de transacciones, los clasifica, persiste los resultados y maneja errores. 
 * Si el procesamiento de un mensaje falla, se reintenta hasta 3 veces utilizando la `retryQueue`. 
 * Si se exceden los reintentos, el mensaje se envía a la `deadLetterQueue`.
 *
 * @async
 * @function startTransactionConsumer
 * @returns {Promise<void>} Resuelve cuando el consumidor finaliza el procesamiento de todos los mensajes y señales de control.
 * @throws {Error} Lanza un error si falla la conexión con RabbitMQ o la configuración de las colas.
 *
 * @requires ../utils/rabbitmq
 * @requires ../utils/waitForQueueEmpty
 * @requires ../services/transactionHelpers
 */
export async function startTransactionConsumer() {
  const channel = await connectRabbitMQ();

  // Definir Exchanges
  const mainExchange = "main_exchange";
  const deadLetterExchange = "dead_letter_exchange";
  const retryExchange = "retry_exchange";

  await channel.assertExchange(mainExchange, "direct", { durable: true });
  await channel.assertExchange(deadLetterExchange, "direct", { durable: true });
  await channel.assertExchange(retryExchange, "direct", { durable: true });

  // Definir Colas
  const mainQueue = "transactionsQueue";
  await channel.assertQueue(mainQueue, {
    durable: true,
    deadLetterExchange: deadLetterExchange, // Mensajes muertos van a DLX
  });
  await channel.bindQueue(mainQueue, mainExchange, "transaction");

  const deadLetterQueue = "deadLetterQueue";
  await channel.assertQueue(deadLetterQueue, { durable: true });
  await channel.bindQueue(deadLetterQueue, deadLetterExchange, "dead");

  const retryQueue = "retryQueue";
  await channel.assertQueue(retryQueue, {
    durable: true,
    messageTtl: 5000, // Tiempo de espera antes de reintentar (5 segundos)
    deadLetterExchange: mainExchange, // Reenvía al mainExchange tras el TTL
    deadLetterRoutingKey: "transaction",
  });
  await channel.bindQueue(retryQueue, retryExchange, "retry");

  channel.prefetch(5);

  const seenTxids = new Set();

  // Promesa que se resuelve cuando todo el proceso ha terminado
  let doneResolve;
  const donePromise = new Promise((resolve) => {
    doneResolve = resolve;
  });

  channel.consume(mainQueue, async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());

      if (content.control) {

        channel.ack(msg);

        await waitForQueuesEmpty(channel, [mainQueue, retryQueue], 1000, 10000);

        doneResolve();
        return;
      }

      const { tx, executionId } = content;

      await updateSeenTxidsFromDB([tx.txid], seenTxids);

      const { validDeposits, failedTransactions } = classifyTransactions(
        [tx],
        executionId,
        seenTxids
      );

      await persistTransactions(validDeposits, failedTransactions);

      channel.ack(msg);
    } catch (error) {

      const headers = msg.properties.headers || {};
      const retryCount = headers["x-retry-count"] || 0;

      if (retryCount < 3) {
        console.warn(
          `⚠️ [Consumer] Error al procesar. Reintentando (${
            retryCount + 1
          }/3)...`
        );
        channel.publish(retryExchange, "retry", msg.content, {
          headers: { "x-retry-count": retryCount + 1 },
          persistent: true,
        });
      } else {
        console.error(
          `❌ [Consumer] Error tras 3 reintentos. Enviando a Dead Letter Queue.`
        );
        channel.publish(deadLetterExchange, "dead", msg.content, {
          persistent: true,
        });
      }

      channel.ack(msg);
    }
  });

  return donePromise;
}
