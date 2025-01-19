import { readJsonFile } from "../utils/fileReader.js";
import {
  saveValidDepositsInBatch,
  saveFailedTransactionsInBatch,
  getAllValidDeposits,
  getExistingTxids
} from "../db/depositRepository.js";
import { MIN_CONFIRMATIONS, KNOWN_ADDRESSES } from "../config/index.js";
import { logger } from "../utils/logger.js";
import {
  TransactionValidationError,
  FileProcessingError,
  DatabaseError,
} from "../utils/errors.js";
import db from "../db/connection.js";

/**
 * Procesa todas las transacciones de los archivos JSON.
 */
export async function processTransactions(executionId) {
  const files = ["transactions-1.json", "transactions-2.json"];
  const seenTxids = new Set(); // Conjunto global de txids vistos en la ejecución actual

  try {
    for (const file of files) {
      await processFile(file, executionId, seenTxids);
    }
    logger.info("✅ Procesamiento completado para todos los archivos.");
  } catch (error) {
    logger.error(`❌ Error al procesar transacciones: ${error.message}`);
  }
}

/**
 * Procesa un archivo JSON de transacciones.
 */
async function processFile(file, executionId, seenTxids) {
  try {
    const data = await readJsonFile(file);
    validateFileData(data, file);

    // Extraer todos los txid del archivo actual
    const fileTxids = data.transactions.map((tx) => tx.txid);

    // Consultar cuáles de esos txid ya existen en la base de datos
    const existingFromDB = await getExistingTxids(fileTxids);
    existingFromDB.forEach((row) => seenTxids.add(row.txid));

    const { validDeposits, failedTransactions } = classifyTransactions(
      data.transactions,
      executionId,
      seenTxids
    );

    // Inicia la transacción
    await db.query("BEGIN");
    try {
      await saveValidDepositsInBatch(validDeposits);
      await saveFailedTransactionsInBatch(failedTransactions);
      await db.query("COMMIT"); // Confirma los cambios
    } catch (error) {
      await db.query("ROLLBACK"); // Revierte los cambios en caso de error
      throw new DatabaseError(
        `Error al guardar datos en la base: ${error.message}`
      );
    }

    logger.info(
      `✅ Procesamiento completado para archivo: ${file}. Válidas: ${validDeposits.length}, Fallidas: ${failedTransactions.length}`
    );
  } catch (error) {
    if (error instanceof FileProcessingError) {
      logger.error(`❌ Error en archivo ${file}: ${error.message}`);
    } else {
      logger.error(`❌ Error inesperado en archivo ${file}: ${error.message}`);
    }
  }
}

/**
 * Clasifica transacciones en válidas y fallidas.
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

      if (isValidDeposit(tx)) {
        validDeposits.push(formatValidDeposit(tx, executionId));
        seenTxids.add(tx.txid);
      } else {
        failedTransactions.push(
          formatFailedTransaction(tx, executionId, "Condición inválida")
        );
      }
    } catch (error) {
      if (error instanceof TransactionValidationError) {
        failedTransactions.push(
          formatFailedTransaction(tx, executionId, error.message)
        );
      } else {
        throw error;
      }
    }
  }

  logger.info(
    `Total procesadas: ${totalProcessed}, Válidas: ${validDeposits.length}, Fallidas: ${failedTransactions.length}`
  );

  return { validDeposits, failedTransactions };
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
 * Formatea una transacción válida.
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
