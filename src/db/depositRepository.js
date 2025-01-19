import db from './connection.js';
import { DatabaseError } from '../utils/errors.js';

/**
 * Guarda una transacción fallida en la base de datos.
 * @param {Object} transaction - Detalles de la transacción fallida.
 */
export async function saveFailedTransaction({ executionId, txid, address, amount, confirmations, reason }) {
  try {
    const query = `
      INSERT INTO failed_transactions (execution_id, txid, address, amount, confirmations, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `;
    const values = [executionId, txid, address, amount, confirmations, reason];
    await db.query(query, values);
  } catch (error) {
    throw new DatabaseError(`Error al registrar transacción fallida: ${error.message}`);
  }
}

/**
 * Obtiene todos los depósitos válidos con el mínimo de confirmaciones.
 * @param {number} minConfirmations - Número mínimo de confirmaciones.
 */
export async function getAllValidDeposits(minConfirmations) {
  try {
    const query = `
      SELECT txid, address, amount, confirmations
      FROM deposits
      WHERE confirmations >= $1
    `;
    const { rows } = await db.query(query, [minConfirmations]);
    return rows;
  } catch (error) {
    throw new DatabaseError(`Error al obtener depósitos válidos: ${error.message}`);
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
    throw new DatabaseError(`Error al guardar log de ejecución: ${error.message}`);
  }
}


/**
 * Guarda múltiples depósitos válidos en batch.
 */
export async function saveValidDepositsInBatch(deposits) {
  if (deposits.length === 0) return;

  const values = deposits
    .map(({ txid, address, amount, confirmations, executionId }) =>
      `('${txid}', '${address}', ${amount}, ${confirmations}, '${executionId}')`
    )
    .join(", ");

  const query = `
    INSERT INTO deposits (txid, address, amount, confirmations, execution_id)
    VALUES ${values}
    ON CONFLICT (txid) DO NOTHING
  `;

  await db.query(query);
}

/**
 * Guarda múltiples transacciones fallidas en batch.
 */
export async function saveFailedTransactionsInBatch(transactions) {
  if (transactions.length === 0) return;

  const values = transactions
    .map(({ executionId, txid, address, amount, confirmations, reason }) =>
      `('${executionId}', '${txid}', '${address}', ${amount}, ${confirmations}, '${reason}')`
    )
    .join(", ");

  const query = `
    INSERT INTO failed_transactions (execution_id, txid, address, amount, confirmations, reason)
    VALUES ${values}
  `;

  await db.query(query);
}
