import db from "./db/connection.js";
import {
  processTransactions,
  aggregateValidDeposits,
} from "./services/transactionProcessor.js";
import { createExecutionLogger } from "./utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import { startTransactionConsumer } from "./consumers/transactionConsumer.js";
import { handleError } from "./utils/errorHandler.js";

async function main() {
  const executionId = uuidv4();
  const logger = createExecutionLogger(executionId);

  try {
    await logger.info(`Ejecución ${executionId} iniciada.`);

    // Ejecutar el procesamiento de transacciones
    await processTransactions(executionId);
    await logger.info(`Procesamiento de transacciones completado.`);

    const consumerDonePromise = startTransactionConsumer();
    await consumerDonePromise;

    // Agregar estadísticas de depósitos válidos
    const { stats, smallest, largest } = await aggregateValidDeposits(
      executionId
    );

    // Log de resultados
    await logResults(stats, smallest, largest, logger);

    await logger.info(`Ejecución ${executionId} finalizada correctamente.`);

    // Cerrar recursos
    await closeResources();
  } catch (error) {
    handleError(error, logger); // Gestión centralizada de errores
    process.exit(1);
  }
}

async function logResults(stats, smallest, largest, logger) {
  const customers = [
    "Wesley Crusher",
    "Leonard McCoy",
    "Jonathan Archer",
    "Jadzia Dax",
    "Montgomery Scott",
    "James T. Kirk",
    "Spock",
  ];

  for (const name of customers) {
    const { count, sum } = stats.known[name] || { count: 0, sum: 0.0 };
    const message = `Deposited for ${name}: count=${count} sum=${sum.toFixed(
      8
    )}`;
    await logger.info(message, true);
    await logger.info(message);
  }

  const unknownMessage = `Deposited without reference: count=${
    stats.unknown?.count || 0
  } sum=${(stats.unknown?.sum || 0).toFixed(8)}`;
  await logger.info(unknownMessage, true);
  await logger.info(unknownMessage);

  const smallestMessage = `Smallest valid deposit: ${smallest.toFixed(8)}`;
  const largestMessage = `Largest valid deposit: ${largest.toFixed(8)}`;
  await logger.info(smallestMessage, true);
  await logger.info(largestMessage, true);
  await logger.info(smallestMessage);
  await logger.info(largestMessage);
}

async function closeResources() {
  await db.pool.end();
}

main();
