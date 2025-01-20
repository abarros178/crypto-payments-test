// src/consumers/transactionConsumer.js
import { connectRabbitMQ } from "../utils/rabbitmq.js";
import {
  updateSeenTxidsFromDB,
  classifyTransactions,
  persistTransactions,
} from "../services/transactionHelpers.js";

/**
 * Inicia el consumer de transacciones, que escucha la cola "transactionsQueue".
 */
export async function startTransactionConsumer() {
  const channel = await connectRabbitMQ();
  await channel.assertQueue("transactionsQueue", { durable: true });

  // 2) Prefetch(1) para forzar consumo en serie (FIFO estricto)
  channel.prefetch(1);


  const seenTxids = new Set();

  // Crear una promesa que se resuelva al recibir el mensaje EOF
  let doneResolve;
  const donePromise = new Promise((resolve) => {
    doneResolve = resolve;
  });

  channel.consume("transactionsQueue", async (msg) => {
    if (!msg) return;

    try {
      const content = JSON.parse(msg.content.toString());

      // Manejo de mensaje de control
      if (content.control) {
        console.log("✅ Mensaje de control recibido. Todo el procesamiento está completo.");
        channel.ack(msg);
        doneResolve(); // Notificar que todo está procesado
        return;
      }

      const { tx, executionId } = content;

      await updateSeenTxidsFromDB( [tx.txid], seenTxids);

      const { validDeposits, failedTransactions } = classifyTransactions(
        [tx],
        executionId,
        seenTxids
      );

      await persistTransactions(validDeposits, failedTransactions);

      channel.ack(msg);
    } catch (error) {
      channel.ack(msg);
    }
  });

  // Retorna la promesa que se resolverá al recibir el mensaje EOF
  return donePromise;
}
