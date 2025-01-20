import db from "./db/connection.js";
import { processTransactions, aggregateValidDeposits } from "./services/transactionProcessor.js";
import { createExecutionLogger } from "./utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import { startTransactionConsumer } from "./consumers/transactionConsumer.js";
import { waitForQueueEmpty } from "./utils/waitForQueueEmpty.js";

async function main() {
  const executionId = uuidv4();
  const logger = createExecutionLogger(executionId); // Logger contextualizado con el Execution ID

  try {

     // Iniciar consumer y obtener promesa de finalización
    const consumerDonePromise = startTransactionConsumer();
    // Log de inicio de ejecución (solo en logs, no en consola)
    await logger.info(`Ejecución ${executionId} iniciada.`);

    // Procesar transacciones
    await processTransactions(executionId);
    await logger.info(`Procesamiento de transacciones completado.`);

    // Esperar a que el consumer reciba y procese el mensaje de control
    await consumerDonePromise;
    console.log("✅ [Main] Consumer notifica que todos los mensajes han sido procesados.");

    // Agregar estadísticas de depósitos válidos
    const { stats, smallest, largest } = await aggregateValidDeposits(executionId);

    const customers = [
      "Wesley Crusher",
      "Leonard McCoy",
      "Jonathan Archer",
      "Jadzia Dax",
      "Montgomery Scott",
      "James T. Kirk",
      "Spock",
    ];

    // Solo imprimir resultados específicos en consola
    for (const name of customers) {
      const { count, sum } = stats.known[name] || { count: 0, sum: 0.0 };
      const message = `Deposited for ${name}: count=${count} sum=${sum.toFixed(8)}`;
      await logger.info(message, true); // Imprime en consola
      await logger.info(message); // También guarda en los logs
    }

    // Registro de depósitos sin referencia en consola
    const { count: unknownCount, sum: unknownSum } = stats.unknown || { count: 0, sum: 0.0 };
    const unknownMessage = `Deposited without reference: count=${unknownCount} sum=${unknownSum.toFixed(8)}`;
    await logger.info(unknownMessage, true); // Imprime en consola
    await logger.info(unknownMessage); // También guarda en los logs

    // Registro de los depósitos más pequeños y más grandes en consola
    const smallestMessage = `Smallest valid deposit: ${smallest.toFixed(8)}`;
    const largestMessage = `Largest valid deposit: ${largest.toFixed(8)}`;
    await logger.info(smallestMessage, true); // Imprime en consola
    await logger.info(largestMessage, true); // Imprime en consola
    await logger.info(smallestMessage); // También guarda en los logs
    await logger.info(largestMessage); // También guarda en los logs

    // Finalizar ejecución exitosamente (solo en logs)
    await logger.info(`Ejecución ${executionId} finalizada correctamente.`);

    // Cerrar conexión a la base de datos
    await db.pool.end();
  } catch (error) {
    // Registrar error en logger y base de datos (solo en logs)
    await logger.error(`Error durante la ejecución: ${error.message}`);
    process.exit(1);
  }
}

main();
