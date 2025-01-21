import db from "./connection.js";
import { handleError } from "../utils/errorHandler.js";
import { encrypt, decrypt } from "../utils/encryption.js";

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
export async function getAllValidDeposits(
  minConfirmations,
  executionId = null
) {
  try {
    let query = `
      SELECT txid, address, amount, confirmations
      FROM deposits
      WHERE confirmations >= $1
    `;

    const params = [minConfirmations];

    if (executionId) {
      query += " AND execution_id = $2";
      params.push(executionId);
    }

    const { rows } = await db.query(query, params);

    // Desencriptar datos sensibles
    return rows.map((row) => ({
      ...row,
      txid: decrypt(row.txid),
      address: decrypt(row.address),
    }));
  } catch (error) {
    handleError(error, "getAllValidDeposits");
    throw error;
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
 *
 * @param {Array<Object>} deposits - Lista de depósitos válidos a insertar.
 * @param {number} [batchSize=500] - Tamaño del batch para inserciones en lotes.
 * @returns {Promise<void>}
 */
export async function saveValidDepositsInBatch(deposits, batchSize = 500) {
  if (deposits.length === 0) return;

  const insertBatch = async (batch) => {
    const values = batch.flatMap(
      ({ txid, address, amount, confirmations, executionId }) => [
        encrypt(txid),
        encrypt(address),
        amount,
        confirmations,
        executionId,
      ]
    );

    const placeholders = batch
      .map(
        (_, index) =>
          `($${index * 5 + 1}, $${index * 5 + 2}, $${index * 5 + 3}, $${
            index * 5 + 4
          }, $${index * 5 + 5})`
      )
      .join(", ");

    const query = `
      INSERT INTO deposits (txid, address, amount, confirmations, execution_id)
      VALUES ${placeholders}
      ON CONFLICT (txid) DO NOTHING
    `;

    await db.query(query, values);
  };

  for (let i = 0; i < deposits.length; i += batchSize) {
    const batch = deposits.slice(i, i + batchSize);
    await insertBatch(batch);
  }
}

/**
 * Guarda múltiples transacciones fallidas en batch.
 *
 * @param {Array<Object>} transactions - Lista de transacciones fallidas a insertar.
 * @param {number} [batchSize=500] - Tamaño del batch para inserciones en lotes.
 * @returns {Promise<void>}
 */
export async function saveFailedTransactionsInBatch(
  transactions,
  batchSize = 500
) {
  if (transactions.length === 0) return;

  const insertBatch = async (batch) => {
    const values = batch.flatMap(
      ({ executionId, txid, address, amount, confirmations, reason }) => [
        executionId,
        encrypt(txid), // Encripta el txid
        encrypt(address), // Encripta la dirección
        amount,
        confirmations,
        reason,
      ]
    );

    const placeholders = batch
      .map(
        (_, index) =>
          `($${index * 6 + 1}, $${index * 6 + 2}, $${index * 6 + 3}, $${
            index * 6 + 4
          }, $${index * 6 + 5}, $${index * 6 + 6})`
      )
      .join(", ");

    const query = `
      INSERT INTO failed_transactions (execution_id, txid, address, amount, confirmations, reason)
      VALUES ${placeholders}
    `;

    await db.query(query, values);
  };

  try {
    for (let i = 0; i < transactions.length; i += batchSize) {
      const batch = transactions.slice(i, i + batchSize);
      await insertBatch(batch);
    }
  } catch (error) {
    handleError(error, "saveFailedTransactionsInBatch");
  }
}

/**
 * Obtiene los txids existentes en la base de datos a partir de una lista dada.
 *
 * @async
 * @function getExistingTxids
 * @param {Array<string>} txids - Lista de txids a buscar en la base de datos.
 * @returns {Promise<Array<{ txid: string }>>} - Lista de objetos que contienen los txids existentes.
 * @throws {Error} - Lanza un error si ocurre un problema durante la consulta a la base de datos.
 */
export async function getExistingTxids(txids) {
  if (!Array.isArray(txids) || txids.length === 0) {
    return []; // Devuelve un array vacío si no hay txids para buscar
  }

  try {
    const query = `SELECT txid FROM deposits WHERE txid = ANY($1)`;
    const { rows } = await db.query(query, [txids]);

    // Desencriptar los txids obtenidos
    return rows.map((row) => ({ ...row, txid: decrypt(row.txid) }));
  } catch (error) {
    handleError(error, "getExistingTxids");
    throw error; // Re-lanza el error para que pueda ser manejado en niveles superiores
  }
}
