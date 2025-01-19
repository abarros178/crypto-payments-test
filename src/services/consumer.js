import { connectRabbitMQ } from "../utils/rabbitmq.js";
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
} from "../db/depositRepository.js";
import {
  validateTransaction,
  isValidDeposit,
  getFailureReason,
} from "./transactionHelpers.js";

(async function consumeMessages() {
  try {
    const channel = await connectRabbitMQ();
    const queue = "transactions";
    const batchSize = 50; // Tamaño del lote para procesar en batch
    let validBatch = [];
    let failedBatch = [];

    // Asegurar que la cola exista
    await channel.assertQueue(queue, { durable: true });

    // Configurar prefetch para controlar cuántos mensajes se procesan en paralelo
    channel.prefetch(20);

    console.log(`🎧 Esperando mensajes en la cola "${queue}"...`);

    // Consumir mensajes de la cola
    channel.consume(queue, async (msg) => {
      if (msg) {
        const { tx, executionId } = JSON.parse(msg.content.toString());

        try {
          console.log(`📥 Procesando transacción: ${JSON.stringify(tx)}`);
          validateTransaction(tx);

          if (isValidDeposit(tx)) {
            validBatch.push({
              txid: tx.txid,
              address: tx.address,
              amount: tx.amount,
              confirmations: tx.confirmations,
              executionId,
            });
            console.log(`✅ Transacción válida: ${tx.txid}`);
          } else {
            failedBatch.push({
              executionId,
              txid: tx.txid,
              address: tx.address,
              amount: tx.amount,
              confirmations: tx.confirmations,
              reason: getFailureReason(tx),
            });
            console.log(`❌ Transacción inválida: ${tx.txid}`);
          }
        } catch (error) {
          console.error(`❌ Error procesando transacción: ${error.message}`);
        }

        channel.ack(msg);
      }
    });

    // Manejar cierre de conexión al finalizar
    process.on("SIGINT", async () => {
      console.log("🛑 Cierre de consumidor en curso...");

      if (validBatch.length > 0) {
        await saveValidDepositsInBatch(validBatch);
      }
      if (failedBatch.length > 0) {
        await saveFailedTransactionsInBatch(failedBatch);
      }

      await channel.close();
      console.log("✅ Conexión a RabbitMQ cerrada.");
      process.exit(0);
    });
  } catch (error) {
    console.error("❌ Error al consumir mensajes:", error.message);
  }
})();
