import { MIN_CONFIRMATIONS } from "../config/index.js";
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
  getExistingTxids,
} from "../db/depositRepository.js";
import db from "../db/connection.js";
import { TransactionValidationError } from "../utils/errors.js";
import { handleError } from "../utils/errorHandler.js";

/**
 * Valida el formato de una transacción.
 * Lanza un error si algún campo requerido no está presente o es inválido.
 *
 * @param {Object} tx - Transacción a validar.
 * @throws {Error} Si la transacción es inválida.
 */
export function validateTransaction(tx) {
  if (
    typeof tx?.txid !== "string" ||
    typeof tx?.address !== "string" ||
    typeof tx?.amount !== "number" ||
    typeof tx?.confirmations !== "number" ||
    typeof tx?.category !== "string"
  ) {
    throw new Error(`Transacción inválida: ${JSON.stringify(tx)}`);
  }
}
/**
 * Determina si una transacción es un depósito válido.
 *
 * @param {Object} tx - Transacción a verificar.
 * @returns {boolean} Verdadero si el depósito es válido; falso en caso contrario.
 */
export function isValidDeposit(tx) {
  return (
    tx.category === "receive" && // La categoría debe ser "receive"
    tx.amount > 0 && // La cantidad debe ser mayor a 0
    tx.confirmations >= MIN_CONFIRMATIONS // Confirmaciones mínimas
  );
}
/**
 * Devuelve la razón por la cual una transacción no es válida.
 *
 * @param {Object} tx - Transacción a analizar.
 * @returns {string} Razón de la invalidez.
 */
export function getFailureReason(tx) {
  if (tx.category !== "receive") return "Categoría inválida";
  if (tx.amount <= 0) return "Monto negativo o cero";
  if (tx.confirmations < MIN_CONFIRMATIONS)
    return "Confirmaciones insuficientes";
  return null; // Es válida
}

/**
 * Actualiza el conjunto de txids vistos con los existentes en la base de datos.
 * @param {Array<string>} fileTxids - Lista de txids del archivo actual.
 * @param {Set<string>} seenTxids - Conjunto de txids ya procesados.
 * @returns {Promise<void>}
 */
export async function updateSeenTxidsFromDB(fileTxids, seenTxids) {
  const existingFromDB = await getExistingTxids(fileTxids);
  existingFromDB.forEach((row) => seenTxids.add(row.txid));
}

/**
 * Clasifica transacciones en válidas y fallidas.
 * @param {Array<Object>} transactions - Lista de transacciones.
 * @param {string} executionId - Identificador único para la ejecución actual.
 * @param {Set<string>} seenTxids - Conjunto de txids ya procesados.
 * @returns {Object} - Contiene listas de depósitos válidos y transacciones fallidas.
 */
export function classifyTransactions(transactions, executionId, seenTxids) {
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
 * Persiste las transacciones válidas y fallidas en la base de datos.
 * @param {Array<Object>} validDeposits - Lista de depósitos válidos.
 * @param {Array<Object>} failedTransactions - Lista de transacciones fallidas.
 * @returns {Promise<void>}
 */
export async function persistTransactions(validDeposits, failedTransactions) {
  try {
    await saveValidDepositsInBatch(validDeposits);
    await saveFailedTransactionsInBatch(failedTransactions);
  } catch (error) {
    handleError(error, "persistTransactions");
  }
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
 * Extrae los txids de una lista de transacciones.
 * @param {Array<Object>} transactions - Lista de transacciones.
 * @returns {Array<string>} - Lista de txids.
 */
export function extractTxids(transactions) {
  return transactions.map((tx) => tx.txid);
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
