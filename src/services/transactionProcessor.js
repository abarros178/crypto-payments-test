import { readJsonFile } from "../utils/fileReader.js";
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
  getAllValidDeposits,
  getExistingTxids,
} from "../db/depositRepository.js";
import { MIN_CONFIRMATIONS, KNOWN_ADDRESSES } from "../config/index.js";
import { handleError } from "../utils/errorHandler.js";
import db from "../db/connection.js";
import { connectRabbitMQ } from "../utils/rabbitmq.js";

/**
 * Publica transacciones en RabbitMQ a partir de archivos JSON, gestionando un Dead Letter Exchange.
 *
 * @param {string} executionId - Identificador único para rastrear la ejecución actual.
 */
export async function processTransactions(executionId) {
  const files = ["transactions-1.json", "transactions-2.json"];
  let channel;

  try {
    channel = await connectRabbitMQ();

    const mainExchange = "main_exchange";
    await channel.assertExchange(mainExchange, "direct", { durable: true });

    const deadLetterExchange = "dead_letter_exchange";
    await channel.assertExchange(deadLetterExchange, "direct", { durable: true });

    const deadLetterQueue = "deadLetterQueue";
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, deadLetterExchange, "dead");

    const mainQueue = "transactionsQueue";
    await channel.assertQueue(mainQueue, {
      durable: true,
      deadLetterExchange,
      deadLetterRoutingKey: "dead",
    });
    await channel.bindQueue(mainQueue, mainExchange, "transaction");

    const publishPromises = files.map(async (file) => {
      const data = await readAndValidateFile(file);
      data.transactions.forEach((tx) => {
        channel.publish(
          mainExchange,
          "transaction",
          Buffer.from(JSON.stringify({ tx, executionId })),
          { persistent: true }
        );
      });
    });

    await Promise.all(publishPromises);

    channel.publish(
      mainExchange,
      "transaction",
      Buffer.from(JSON.stringify({ control: true, executionId })),
      { persistent: true }
    );

    console.log("✅ Mensajes publicados correctamente.");
  } catch (error) {
    handleError(error, "processTransactions");
  } finally {
    if (channel) {
      await channel.close();
      console.log("✅ Canal de RabbitMQ cerrado correctamente.");
    }
  }
}

/**
 * Lee y valida el archivo JSON.
 * @param {string} file - Nombre del archivo JSON.
 * @returns {Promise<Object>} - Datos validados del archivo JSON.
 * @throws {FileProcessingError} - Si el archivo tiene un formato inválido.
 */
async function readAndValidateFile(file) {
  const data = await readJsonFile(file);
  validateFileData(data, file);
  return data;
}
/**
 * Valida el formato de los datos del archivo.
 * @param {Object} data - Datos del archivo JSON.
 * @param {string} file - Nombre del archivo.
 * @throws {FileProcessingError} - Si el formato es inválido.
 */
function validateFileData(data, file) {
  if (!data?.transactions || !Array.isArray(data.transactions)) {
    throw new FileProcessingError(`Formato inválido en archivo: ${file}`);
  }
}
/**
 * Agrega estadísticas de depósitos válidos.
 * @returns {Promise<Object>} - Contiene estadísticas y los depósitos más pequeños y más grandes.
 */
export async function aggregateValidDeposits(executionId) {
  try {
    const deposits = await getAllValidDeposits(MIN_CONFIRMATIONS, executionId);

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
    handleError(error, "aggregateValidDeposits");
  }
}
