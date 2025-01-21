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

  // Configurar el intercambio principal
  const mainExchange = "main_exchange";
  await channel.assertExchange(mainExchange, "direct", { durable: true });

  // Configurar el Dead Letter Exchange
  const deadLetterExchange = "dead_letter_exchange";
  await channel.assertExchange(deadLetterExchange, "direct", { durable: true });

  // Configurar la cola principal con DLX
  const mainQueue = "transactionsQueue";
  await channel.assertQueue(mainQueue, {
    durable: true,
    deadLetterExchange, // Vincula al DLX
    deadLetterRoutingKey: "dead", // Enrutamiento a la DLQ
  });
  await channel.bindQueue(mainQueue, mainExchange, "transaction");

  // Prefetch(1) para procesamiento en serie (FIFO)
  channel.prefetch(1);

  const seenTxids = new Set();

  // Crear una promesa que se resuelva al recibir el mensaje EOF
  let doneResolve;
  const donePromise = new Promise((resolve) => {
    doneResolve = resolve;
  });

  channel.consume(mainQueue, async (msg) => {
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

      // Procesar transacción
      await updateSeenTxidsFromDB([tx.txid], seenTxids);
      const { validDeposits, failedTransactions } = classifyTransactions(
        [tx],
        executionId,
        seenTxids
      );
      await persistTransactions(validDeposits, failedTransactions);

      // Reconocer mensaje exitoso
      channel.ack(msg);
    } catch (error) {
      console.error(`⚠️ Error procesando mensaje: ${error.message}`);

      // Manejo de errores: Redirigir al Dead Letter Exchange
      channel.nack(msg, false, false); // Rechazar sin reintento para que vaya al DLQ
    }
  });

  // Retorna la promesa que se resolverá al recibir el mensaje EOF
  return donePromise;
}

