import { readJsonFile } from "../utils/fileReader.js";
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
  getAllValidDeposits,
  getExistingTxids,
} from "../db/depositRepository.js";
import { MIN_CONFIRMATIONS, KNOWN_ADDRESSES } from "../config/index.js";
import {
  validateTransaction,
  getFailureReason,
} from "../services/transactionHelpers.js";
import { handleError } from "../utils/errorHandler.js";
import db from "../db/connection.js";

/**
 * Procesa todas las transacciones de los archivos JSON.
 * @param {string} executionId - Identificador único para la ejecución actual.
 * @returns {Promise<void>}
 */
export async function processTransactions(executionId) {
  const files = ["transactions-1.json", "transactions-2.json"];
  const seenTxids = new Set();

  try {
    for (const file of files) {
      await processFile(file, executionId, seenTxids);
    }
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
 * Extrae los txids de una lista de transacciones.
 * @param {Array<Object>} transactions - Lista de transacciones.
 * @returns {Array<string>} - Lista de txids.
 */
function extractTxids(transactions) {
  return transactions.map((tx) => tx.txid);
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
 * Clasifica transacciones en válidas y fallidas.
 * @param {Array<Object>} transactions - Lista de transacciones.
 * @param {string} executionId - Identificador único para la ejecución actual.
 * @param {Set<string>} seenTxids - Conjunto de txids ya procesados.
 * @returns {Object} - Contiene listas de depósitos válidos y transacciones fallidas.
 */
function classifyTransactions(transactions, executionId, seenTxids) {
  const validDeposits = [];
  const failedTransactions = [];
  let totalProcessed = 0;

  for (const tx of transactions) {
    totalProcessed++;
    try {
      validateTransaction(tx);

      if (seenTxids.has(tx.txid)) {
        failedTransactions.push(
          formatFailedTransaction(tx, executionId, "Transacción duplicada")
        );
        continue;
      }

      const failureReason = getFailureReason(tx);

      if (failureReason === null) {
        // Transacción válida
        validDeposits.push(formatValidDeposit(tx, executionId));
        seenTxids.add(tx.txid); // Marcar como procesada
      } else {
        // Transacción inválida con una razón específica
        failedTransactions.push(
          formatFailedTransaction(tx, executionId, failureReason)
        );
      }
    } catch (error) {
      if (error instanceof TransactionValidationError) {
        failedTransactions.push(
          formatFailedTransaction(tx, executionId, error.message)
        );
      } else {
        handleError(error, "classifyTransactions");
      }
    }
  }

  return { validDeposits, failedTransactions };
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
 * Formatea una transacción válida.
 * @param {Object} tx - Transacción a formatear.
 * @param {string} executionId - Identificador único para la ejecución actual.
 * @returns {Object} - Transacción válida formateada.
 */
function formatValidDeposit(tx, executionId) {
  return {
    txid: tx.txid,
    address: tx.address,
    amount: tx.amount,
    confirmations: tx.confirmations,
    executionId,
  };
}

/**
 * Formatea una transacción fallida.
 * @param {Object} tx - Transacción a formatear.
 * @param {string} executionId - Identificador único para la ejecución actual.
 * @param {string} reason - Razón de la falla.
 * @returns {Object} - Transacción fallida formateada.
 */
function formatFailedTransaction(tx, executionId, reason) {
  return {
    executionId,
    txid: tx.txid || null,
    address: tx.address || null,
    amount: tx.amount || null,
    confirmations: tx.confirmations || null,
    reason,
  };
}

/**
 * Agrega estadísticas de depósitos válidos.
 * @returns {Promise<Object>} - Contiene estadísticas y los depósitos más pequeños y más grandes.
 */
export async function aggregateValidDeposits(executionId) {
  try {
    const deposits = await getAllValidDeposits(MIN_CONFIRMATIONS,executionId);

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
