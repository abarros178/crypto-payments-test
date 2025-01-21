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
 * Procesa todas las transacciones de los archivos JSON,
 * pero ahora en vez de guardarlas directamente, las encolamos en RabbitMQ.
 *
 * @param {string} executionId
 */
export async function processTransactions(executionId) {
  const files = ["transactions-1.json", "transactions-2.json"];
  try {
    // Conexión y creación de un canal
    const channel = await connectRabbitMQ();

    // Configurar el intercambio principal
    const mainExchange = "main_exchange";
    await channel.assertExchange(mainExchange, "direct", { durable: true });

    // Configurar el Dead Letter Exchange
    const deadLetterExchange = "dead_letter_exchange";
    await channel.assertExchange(deadLetterExchange, "direct", {
      durable: true,
    });

    // Configurar la Dead Letter Queue
    const deadLetterQueue = "deadLetterQueue";
    await channel.assertQueue(deadLetterQueue, { durable: true });
    await channel.bindQueue(deadLetterQueue, deadLetterExchange, "dead");

    // Configurar la cola principal con DLX
    const mainQueue = "transactionsQueue";
    await channel.assertQueue(mainQueue, {
      durable: true,
      deadLetterExchange, // Vincula al DLX
      deadLetterRoutingKey: "dead", // Enrutamiento a la DLQ
    });
    await channel.bindQueue(mainQueue, mainExchange, "transaction");

    // Procesar los archivos JSON y publicar transacciones
    for (const file of files) {
      const data = await readAndValidateFile(file);

      for (const tx of data.transactions) {
        // Publicar cada transacción en el mainExchange
        channel.publish(
          mainExchange,
          "transaction", // Routing key para la cola principal
          Buffer.from(JSON.stringify({ tx, executionId })),
          { persistent: true } // Mensaje persistente
        );
      }
    }

    // Publicar un mensaje de control al final
    channel.publish(
      mainExchange,
      "transaction",
      Buffer.from(JSON.stringify({ control: true, executionId })),
      { persistent: true }
    );

    console.log("✅ [processTransactions] Mensajes publicados correctamente.");
  } catch (error) {
    handleError(error, "processTransactions");
  }
}

/**
 * Procesa un archivo JSON de transacciones.
 * @param {string} file - Nombre del archivo JSON a procesar.
 * @param {string} executionId - Identificador único para la ejecución actual.
 * @param {Set<string>} seenTxids - Conjunto de txids ya procesados.
 * @returns {Promise<void>}
 */
async function processFile(file, executionId, seenTxids) {
  try {
    const data = await readAndValidateFile(file);
    const fileTxids = extractTxids(data.transactions);
    await updateSeenTxidsFromDB(fileTxids, seenTxids);
    const { validDeposits, failedTransactions } = classifyTransactions(
      data.transactions,
      executionId,
      seenTxids
    );
    await persistTransactions(validDeposits, failedTransactions);
  } catch (error) {
    handleError(error, `processFile: ${file}`);
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
 * Actualiza el conjunto de txids vistos con los existentes en la base de datos.
 * @param {Array<string>} fileTxids - Lista de txids del archivo actual.
 * @param {Set<string>} seenTxids - Conjunto de txids ya procesados.
 * @returns {Promise<void>}
 */
async function updateSeenTxidsFromDB(fileTxids, seenTxids) {
  const existingFromDB = await getExistingTxids(fileTxids);
  existingFromDB.forEach((row) => seenTxids.add(row.txid));
}
/**
 * Persiste las transacciones válidas y fallidas en la base de datos.
 * @param {Array<Object>} validDeposits - Lista de depósitos válidos.
 * @param {Array<Object>} failedTransactions - Lista de transacciones fallidas.
 * @returns {Promise<void>}
 */
async function persistTransactions(validDeposits, failedTransactions) {
  await db.query("BEGIN");
  try {
    await saveValidDepositsInBatch(validDeposits);
    await saveFailedTransactionsInBatch(failedTransactions);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    handleError(error, "persistTransactions");
  }
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
