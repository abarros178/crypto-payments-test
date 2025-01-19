import { readJsonFile } from "../utils/fileReader.js";
import {
  saveFailedTransaction,
  getAllValidDeposits,
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
} from "../db/depositRepository.js";
import { KNOWN_ADDRESSES, MIN_CONFIRMATIONS } from "../config/index.js";
import { logger } from "../utils/logger.js";
import {
  TransactionValidationError,
  FileProcessingError,
  DatabaseError,
} from "../utils/errors.js";
import { connectRabbitMQ } from "../utils/rabbitmq.js";

const validDeposits = [];
const failedTransactions = [];

/**
 * Procesa todas las transacciones de los archivos JSON de forma concurrente.
 */
export async function processTransactions(executionId) {
  const files = ["transactions-1.json", "transactions-2.json"];
  const channel = await connectRabbitMQ();
  const queue = "transactions";

  try {
    await channel.assertQueue(queue, { durable: true });

    for (const file of files) {
      logger.info(`📂 Procesando archivo: ${file}`);
      const data = await readJsonFile(file);
      validateFileData(data, file);

      // Procesar las transacciones en lotes
      const batchSize = 50;
      let batch = [];

      for (const tx of data.transactions) {
        try {
          validateTransaction(tx);

          if (isValidDeposit(tx)) {
            validDeposits.push({
              txid: tx.txid,
              address: tx.address,
              amount: tx.amount,
              confirmations: tx.confirmations,
              executionId,
            });
          } else {
            failedTransactions.push({
              executionId,
              txid: tx.txid,
              address: tx.address,
              amount: tx.amount,
              confirmations: tx.confirmations,
              reason: getFailureReason(tx),
            });
          }
        } catch (error) {
          failedTransactions.push({
            executionId,
            txid: tx.txid || null,
            address: tx.address || null,
            amount: tx.amount || null,
            confirmations: tx.confirmations || null,
            reason: error.message,
          });
        }

        // Manejo de lotes para RabbitMQ
        batch.push({ tx, executionId });
        if (batch.length >= batchSize) {
          await sendBatchToQueue(channel, queue, batch);
          batch = [];
        }
      }

      // Enviar cualquier lote restante
      if (batch.length > 0) {
        await sendBatchToQueue(channel, queue, batch);
      }
    }

    // Guardar depósitos y transacciones fallidas en la base de datos
    if (validDeposits.length > 0) {
      await saveValidDepositsInBatch(validDeposits);
      logger.info(`💾 Guardados ${validDeposits.length} depósitos válidos.`);
      validDeposits.length = 0; // Vaciar el arreglo
    }

    if (failedTransactions.length > 0) {
      await saveFailedTransactionsInBatch(failedTransactions);
      logger.info(`💾 Guardadas ${failedTransactions.length} transacciones fallidas.`);
      failedTransactions.length = 0; // Vaciar el arreglo
    }
  } catch (error) {
    logger.error(`❌ Error al procesar transacciones: ${error.message}`);
  } finally {
    await channel.close();
  }
}


/**
 * Envía un lote de transacciones a la cola RabbitMQ.
 */
async function sendBatchToQueue(channel, queue, batch) {
  try {
    for (const msg of batch) {
      channel.sendToQueue(queue, Buffer.from(JSON.stringify(msg)), {
        persistent: true,
      });
    }
    logger.info(`✅ Lote enviado a la cola (${batch.length} mensajes).`);
  } catch (error) {
    logger.error(`❌ Error al enviar lote a RabbitMQ: ${error.message}`);
    throw new Error("Error al enviar transacciones a la cola.");
  }
}

/**
 * Procesa un archivo JSON de transacciones.
 */
async function processFile(file, executionId) {
  try {
    const data = await readJsonFile(file);
    validateFileData(data, file);

    // Procesar todas las transacciones
    await Promise.all(
      data.transactions.map((tx) => handleTransaction(tx, executionId))
    );

    // Guardar en batch
    await saveValidDepositsInBatch(validDeposits);
    await saveFailedTransactionsInBatch(failedTransactions);

    // Limpiar las listas después de guardar
    validDeposits.length = 0;
    failedTransactions.length = 0;
  } catch (error) {
    handleFileError(error, file);
  }
}

/**
 * Maneja una transacción individual.
 */
async function handleTransaction(tx, executionId) {
  try {
    validateTransaction(tx);

    if (isValidDeposit(tx)) {
      validDeposits.push({
        txid: tx.txid,
        address: tx.address,
        amount: tx.amount,
        confirmations: tx.confirmations,
        executionId,
      });
    } else {
      failedTransactions.push({
        executionId,
        txid: tx.txid,
        address: tx.address,
        amount: tx.amount,
        confirmations: tx.confirmations,
        reason: getFailureReason(tx),
      });
    }
  } catch (error) {
    failedTransactions.push({
      executionId,
      txid: tx.txid || null,
      address: tx.address || null,
      amount: tx.amount || null,
      confirmations: tx.confirmations || null,
      reason: error.message,
    });
  }
}

/**
 * Valida el formato de los datos del archivo.
 */
function validateFileData(data, file) {
  if (!data?.transactions || !Array.isArray(data.transactions)) {
    throw new FileProcessingError(`Formato inválido en archivo: ${file}`);
  }
}

/**
 * Valida el formato de una transacción.
 */
function validateTransaction(tx) {
  if (
    typeof tx?.txid !== "string" ||
    typeof tx?.address !== "string" ||
    typeof tx?.amount !== "number" ||
    typeof tx?.confirmations !== "number"
  ) {
    throw new TransactionValidationError(
      `Transacción inválida: ${JSON.stringify(tx)}`
    );
  }
}

/**
 * Determina si una transacción es un depósito válido.
 */
function isValidDeposit(tx) {
  return (
    tx.category === "receive" &&
    tx.amount > 0 &&
    tx.confirmations >= MIN_CONFIRMATIONS
  );
}

/**
 * Devuelve la razón por la cual una transacción falló.
 */
function getFailureReason(tx) {
  if (tx.category !== "receive") return "Categoría inválida";
  if (tx.amount <= 0) return "Monto negativo o cero";
  return "Confirmaciones insuficientes";
}

/**
 * Maneja errores de transacciones.
 */
async function handleTransactionError(error, tx, executionId) {
  if (error instanceof TransactionValidationError) {
    logger.warn(`Transacción inválida: ${error.message}`);
    await saveFailedTransaction({
      executionId,
      txid: tx.txid || null,
      address: tx.address || null,
      amount: tx.amount || null,
      confirmations: tx.confirmations || null,
      reason: error.message,
    });
  } else {
    logger.error(`Error inesperado en transacción: ${error.message}`);
    throw error;
  }
}

/**
 * Maneja errores al procesar archivos.
 */
function handleFileError(error, file) {
  if (error instanceof FileProcessingError) {
    logger.error(`Error al procesar archivo ${file}: ${error.message}`);
  } else {
    logger.error(
      `Error inesperado al procesar archivo ${file}: ${error.message}`
    );
  }
}

export async function aggregateValidDeposits() {
  try {
    const deposits = await getAllValidDeposits(MIN_CONFIRMATIONS);

    const stats = {
      known: {},
      unknown: { count: 0, sum: 0 },
    };

    for (const name of Object.values(KNOWN_ADDRESSES)) {
      stats.known[name] = { count: 0, sum: 0 };
    }

    let smallest = Number.MAX_VALUE;
    let largest = Number.MIN_VALUE;

    for (const deposit of deposits) {
      const { address, amount } = deposit;
      const numericAmount = Number(amount) || 0;

      if (numericAmount < smallest) smallest = numericAmount;
      if (numericAmount > largest) largest = numericAmount;

      if (KNOWN_ADDRESSES[address]) {
        const customerName = KNOWN_ADDRESSES[address];
        stats.known[customerName].count += 1;
        stats.known[customerName].sum += numericAmount;
      } else {
        stats.unknown.count += 1;
        stats.unknown.sum += numericAmount;
      }
    }

    if (smallest === Number.MAX_VALUE) smallest = 0;
    if (largest === Number.MIN_VALUE) largest = 0;

    return { stats, smallest, largest };
  } catch (error) {
    logger.error(`Error al agregar depósitos válidos: ${error.message}`);
    throw new DatabaseError(
      `Error en la agregación de datos: ${error.message}`
    );
  }
}
