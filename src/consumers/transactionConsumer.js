// src/consumers/transactionConsumer.js
import { connectRabbitMQ } from "../utils/rabbitmq.js";
import {
  updateSeenTxidsFromDB,
  classifyTransactions,
  persistTransactions,
} from "../services/transactionHelpers.js";
import { waitForQueuesEmpty } from "../utils/waitForQueueEmpty.js";

/**
 * Inicia el consumidor de transacciones, procesando mensajes de la cola "transactionsQueue".
 * Los mensajes se acumulan en lotes y se procesan en bloques para optimizar la eficiencia.
 *
 * @async
 * @function startTransactionConsumer
 * @returns {Promise<void>} - Promesa que se resuelve cuando el procesamiento está completo.
 * @throws {Error} - Lanza un error si ocurre un problema en la configuración del canal o durante el consumo.
 */
export async function startTransactionConsumer() {
  const channel = await connectRabbitMQ();
  const mainExchange = "main_exchange";
  const deadLetterExchange = "dead_letter_exchange";
  const mainQueue = "transactionsQueue";
  const BATCH_SIZE = 50;

  const batch = [];
  const seenTxids = new Set();

  let doneResolve;
  const donePromise = new Promise((resolve) => {
    doneResolve = resolve;
  });

  await channel.assertExchange(mainExchange, "direct", { durable: true });
  await channel.assertExchange(deadLetterExchange, "direct", { durable: true });

  await channel.assertQueue(mainQueue, {
    durable: true,
    deadLetterExchange,
    deadLetterRoutingKey: "dead",
  });
  await channel.bindQueue(mainQueue, mainExchange, "transaction");
  channel.prefetch(1);

  channel.consume(mainQueue, async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());

      if (content.control) {
        if (batch.length > 0) {
          await processBatch(batch, seenTxids);
          batch.length = 0;
        }
        channel.ack(msg);
        await waitForQueuesEmpty(channel, [mainQueue], 1000, 60000);
        doneResolve();
        return;
      }

      batch.push(content);

      if (batch.length >= BATCH_SIZE) {
        await processBatch(batch, seenTxids);
        batch.length = 0;
      }

      channel.ack(msg);
    } catch (error) {
      console.error(`⚠️ Error procesando mensaje: ${error.message}`);
      channel.nack(msg, false, false);
    }
  });

  return donePromise;
}


  /**
   * Procesa un batch de transacciones.
   * @param {Array<Object>} batch - Batch de mensajes a procesar.
   * @param {Set<string>} seenTxids - Conjunto de txids ya procesados.
   */
  async function processBatch(batch, seenTxids) {
    const txids = batch.map(({ tx }) => tx.txid);
  
    // Actualizar el conjunto de txids vistos desde la base de datos
    await updateSeenTxidsFromDB(txids, seenTxids);
  
    const validDeposits = [];
    const failedTransactions = [];
  
    for (const { tx, executionId } of batch) {
      const { validDeposits: valid, failedTransactions: failed } = classifyTransactions(
        [tx],
        executionId,
        seenTxids
      );
      validDeposits.push(...valid);
      failedTransactions.push(...failed);
    }
  
    // Persistir los resultados en la base de datos
    await persistTransactions(validDeposits, failedTransactions);
  }