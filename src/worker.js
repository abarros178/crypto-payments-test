import { connectRabbitMQ } from "./utils/rabbitmq.js";
import {
  validateTransaction,
  isValidDeposit,
  getFailureReason,
} from "./services/transactionHelpers.js";
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
} from "./db/depositRepository.js";
import { logger } from "./utils/logger.js";

// Configuración de lotes
const validDeposits = [];
const failedTransactions = [];
const BATCH_SIZE = 50;

async function startConsumer() {
  const queue = "transactions";
  const channel = await connectRabbitMQ();

  try {
    // Asegurar que la cola existe y es durable
    await channel.assertQueue(queue, { durable: true });
    console.log(
      "✅ Worker iniciado, esperando mensajes en la cola 'transactions'..."
    );

    // Configurar prefetch para limitar mensajes procesados simultáneamente
    channel.prefetch(0);

    // Consumir mensajes de la cola
    channel.consume(
      queue,
      async (msg) => {
        if (msg) {
          try {
            const content = JSON.parse(msg.content.toString());
            const { tx, executionId } = content;

            // Validar y clasificar la transacción
            validateTransaction(tx);

            if (isValidDeposit(tx)) {
              validDeposits.push({
                txid: tx.txid,
                address: tx.address,
                amount: tx.amount,
                confirmations: tx.confirmations,
                executionId,
              });
              logger.info(`✅ Transacción válida: ${tx.txid}`);
            } else {
              failedTransactions.push({
                executionId,
                txid: tx.txid,
                address: tx.address,
                amount: tx.amount,
                confirmations: tx.confirmations,
                reason: getFailureReason(tx),
              });
              logger.warn(`❌ Transacción inválida: ${tx.txid}`);
            }
          } catch (error) {
            logger.error(`❌ Error procesando mensaje: ${error.message}`);
          } finally {
            channel.ack(msg); // Confirmar procesamiento del mensaje
          }

          // Procesar lotes si alcanzan el tamaño configurado
          await processBatches();
        }
      },
      { noAck: false }
    );

    // Manejar señal de cierre para guardar lo que quede en los lotes
    process.on("SIGINT", async () => {
      logger.info("🛑 Cierre de consumidor en curso...");
      await processBatches(true); // Forzar guardado de todos los lotes
      await channel.close();
      logger.info("✅ Conexión a RabbitMQ cerrada.");
      process.exit(0);
    });
  } catch (error) {
    logger.error(`❌ Error en el consumidor: ${error.message}`);
    process.exit(1);
  }
}

// Guardar los lotes en la base de datos
async function processBatches(force = false) {
  if (validDeposits.length >= BATCH_SIZE || force) {
    try {
      await saveValidDepositsInBatch(validDeposits);
      logger.info(`💾 Guardados ${validDeposits.length} depósitos válidos.`);
    } catch (error) {
      logger.error(`❌ Error al guardar depósitos válidos: ${error.message}`);
    } finally {
      validDeposits.length = 0; // Vaciar el lote de depósitos válidos
    }
  }

  if (failedTransactions.length >= BATCH_SIZE || force) {
    try {
      await saveFailedTransactionsInBatch(failedTransactions);
      logger.info(
        `💾 Guardadas ${failedTransactions.length} transacciones fallidas.`
      );
    } catch (error) {
      logger.error(
        `❌ Error al guardar transacciones fallidas: ${error.message}`
      );
    } finally {
      failedTransactions.length = 0; // Vaciar el lote de transacciones fallidas
    }
  }
}

startConsumer();
