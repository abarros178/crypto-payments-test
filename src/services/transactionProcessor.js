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
 * Procesa todas las transacciones de los archivos JSON y las encola en RabbitMQ en lugar de guardarlas directamente.
 * 
 * Este método lee transacciones de archivos JSON, las valida y las publica en el exchange `main_exchange` de RabbitMQ.
 * Al final del proceso, envía un mensaje de control para indicar que todas las transacciones han sido encoladas.
 *
 * @async
 * @function processTransactions
 * @param {string} executionId - Identificador único de la ejecución actual para rastrear transacciones y su contexto.
 * @returns {Promise<void>} Resuelve cuando todas las transacciones han sido procesadas y encoladas correctamente.
 * @throws {Error} Lanza un error si ocurre algún problema al leer los archivos, validar las transacciones o interactuar con RabbitMQ.
 *
 * @requires ../utils/rabbitmq
 * @requires ../services/transactionHelpers
 * @requires ../utils/fileReader
 * @requires ../utils/errorHandler
 */
export async function processTransactions(executionId) {
  const files = ["transactions-1.json", "transactions-2.json"];
  try {
    // Crea o reutiliza un canal de RabbitMQ
    const channel = await connectRabbitMQ();

    const mainExchange = "main_exchange";

    await channel.assertExchange(mainExchange, "direct", { durable: true });

    for (const file of files) {
      const data = await readAndValidateFile(file);
      for (const tx of data.transactions) {
        channel.publish(
          mainExchange,
          "transaction",
          Buffer.from(JSON.stringify({ tx, executionId })),
          { persistent: true }
        );
      }
    }

    // Enviar un mensaje de control al final a través del exchange
    channel.publish(
      mainExchange,
      "transaction",
      Buffer.from(JSON.stringify({ control: true, executionId })),
      { persistent: true }
    );
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
