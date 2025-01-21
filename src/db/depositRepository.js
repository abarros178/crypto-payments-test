import db from "./connection.js";
import { handleError } from "../utils/errorHandler.js";
const BATCH_SIZE = 20;
/**
 * Guarda una transacción fallida en la base de datos.
 * @param {Object} transaction - Detalles de la transacción fallida.
 */
export async function saveFailedTransaction({
  executionId,
  txid,
  address,
  amount,
  confirmations,
  reason,
}) {
  try {
    const query = `
      INSERT INTO failed_transactions (execution_id, txid, address, amount, confirmations, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const values = [executionId, txid, address, amount, confirmations, reason];
    await db.query(query, values);
  } catch (error) {
    handleError(error, "saveFailedTransaction");
  }
}

/**
 * Obtiene todos los depósitos válidos con el mínimo de confirmaciones y opcionalmente para una ejecución específica.
 * @param {number} minConfirmations - Número mínimo de confirmaciones.
 * @param {string} [executionId] - (Opcional) Identificador de la ejecución actual para filtrar los depósitos.
 * @returns {Promise<Array<Object>>} - Lista de depósitos válidos.
 */
export async function getAllValidDeposits(minConfirmations, executionId = null) {
  try {
    let query = `
      SELECT txid, address, amount, confirmations
      FROM deposits
      WHERE confirmations >= $1
    `;

    const params = [minConfirmations];

    // Agregar filtro por executionId si está disponible
    if (executionId) {
      query += " AND execution_id = $2";
      params.push(executionId);
    }

    const { rows } = await db.query(query, params);
    return rows;
  } catch (error) {
    handleError(error, "getAllValidDeposits");
    throw error; // Re-lanzar el error para el manejo en niveles superiores
  }
}


/**
 * Guarda logs de la ejecución del proceso.
 * @param {Object} log - Detalles del log de ejecución.
 */
export async function saveExecutionLog({ executionId, logLevel, message }) {
  try {
    const query = `
      INSERT INTO execution_logs (execution_id, log_level, message)
      VALUES ($1, $2, $3)
    `;
    const values = [executionId, logLevel, message];
    await db.query(query, values);
  } catch (error) {
    handleError(error, "saveExecutionLog");
  }
}

/**
 * Guarda múltiples depósitos válidos en batch.
 */
export async function saveValidDepositsInBatch(deposits, batchSize = 500) {
  if (deposits.length === 0) return;

  for (let i = 0; i < deposits.length; i += batchSize) {
    const batch = deposits.slice(i, i + batchSize);
    const values = batch
      .map(
        ({ txid, address, amount, confirmations, executionId }) =>
          `('${txid}', '${address}', ${amount}, ${confirmations}, '${executionId}')`
      )
      .join(", ");

    const query = `
      INSERT INTO deposits (txid, address, amount, confirmations, execution_id)
      VALUES ${values}
      ON CONFLICT (txid) DO NOTHING
    `;

    try {
      await db.query(query);
    } catch (error) {
      handleError(error, "saveValidDepositsInBatch");
    }
  }
}

/**
 * Guarda múltiples transacciones fallidas en batch.
 */
export async function saveFailedTransactionsInBatch(transactions) {
  if (transactions.length === 0) return;

  try {
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const chunk = transactions.slice(i, i + BATCH_SIZE);

      const values = chunk
        .map(
          ({ executionId, txid, address, amount, confirmations, reason }) =>
            `('${executionId}', '${txid}', '${address}', ${amount}, ${confirmations}, '${reason.replace(
              /'/g,
              "''"
            )}')` // Sanitiza datos
        )
        .join(", ");

      const query = `
        INSERT INTO failed_transactions (execution_id, txid, address, amount, confirmations, reason)
        VALUES ${values}
      `;

      await db.query(query);
    }
  } catch (error) {
    handleError(error, "saveFailedTransactionsInBatch");
  }
}

export async function getExistingTxids(txids) {
  try {
    const query = `SELECT txid FROM deposits WHERE txid = ANY($1)`;
    const { rows } = await db.query(query, [txids]);
    return rows;
  } catch (error) {
    handleError(error, "getExistingTxids");
  }
}
