import db from "./db/connection.js";
import {
  processTransactions,
  aggregateValidDeposits,
} from "./services/transactionProcessor.js";
import { createExecutionLogger } from "./utils/logger.js";
import { v4 as uuidv4 } from "uuid";
import { startTransactionConsumer } from "./consumers/transactionConsumer.js";
import { closeRabbitMQ } from "./utils/rabbitmq.js";

async function main() {
  const executionId = uuidv4();
  console.log(`[main] Ejecución iniciada con ID: ${executionId}`);
  const logger = createExecutionLogger(executionId); // Logger contextualizado con el Execution ID

  try {
    // Iniciar consumer y obtener promesa de finalización
    console.log("[main] Iniciando consumidor de transacciones...");
    const consumerDonePromise = startTransactionConsumer();

    // Log de inicio de ejecución (solo en logs, no en consola)
    await logger.info(`Ejecución ${executionId} iniciada.`);
    console.log("[main] Consumidor de transacciones iniciado.");

    // Procesar transacciones
    console.log("[main] Iniciando procesamiento de transacciones...");
    await processTransactions(executionId);
    console.log("[main] Procesamiento de transacciones completado.");
    await logger.info(`Procesamiento de transacciones completado.`);

    // Esperar a que el consumer reciba y procese el mensaje de control
    console.log("[main] Esperando a que el consumidor procese el mensaje de control...");
    await consumerDonePromise;
    await new Promise((resolve) => setTimeout(resolve, 10000));
    console.log("[main] Consumidor finalizó el procesamiento.");

    // Agregar estadísticas de depósitos válidos
    console.log("[main] Calculando estadísticas de depósitos válidos...");
    const { stats, smallest, largest } = await aggregateValidDeposits(
      executionId
    );

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
      const message = `Deposited for ${name}: count=${count} sum=${sum.toFixed(
        8
      )}`;
      console.log(`[main] ${message}`);
      await logger.info(message, true); // Imprime en consola
      await logger.info(message); // También guarda en los logs
    }

    // Registro de depósitos sin referencia en consola
    const { count: unknownCount, sum: unknownSum } = stats.unknown || {
      count: 0,
      sum: 0.0,
    };
    const unknownMessage = `Deposited without reference: count=${unknownCount} sum=${unknownSum.toFixed(
      8
    )}`;
    console.log(`[main] ${unknownMessage}`);
    await logger.info(unknownMessage, true); // Imprime en consola
    await logger.info(unknownMessage); // También guarda en los logs

    // Registro de los depósitos más pequeños y más grandes en consola
    const smallestMessage = `Smallest valid deposit: ${smallest.toFixed(8)}`;
    const largestMessage = `Largest valid deposit: ${largest.toFixed(8)}`;
    console.log(`[main] ${smallestMessage}`);
    console.log(`[main] ${largestMessage}`);
    await logger.info(smallestMessage, true); // Imprime en consola
    await logger.info(largestMessage, true); // Imprime en consola
    await logger.info(smallestMessage); // También guarda en los logs
    await logger.info(largestMessage); // También guarda en los logs

    // Finalizar ejecución exitosamente (solo en logs)
    await logger.info(`Ejecución ${executionId} finalizada correctamente.`);
    console.log(`[main] Ejecución ${executionId} finalizada correctamente.`);
  } catch (error) {
    console.error(`[main] Error durante la ejecución: ${error.message}`);
    await logger.error(`Error durante la ejecución: ${error.message}`);
    process.exit(1);
  } finally {
    // Asegura el cierre de recursos, incluso si hubo errores
    console.log("[main] Cerrando recursos...");
    try {
      // Intentar cerrar RabbitMQ
      try {
        console.log("[main] Cerrando conexión a RabbitMQ...");
        await closeRabbitMQ();
        console.log("[main] Conexión a RabbitMQ cerrada.");
      } catch (rabbitError) {
        console.error(`[main] Error al cerrar RabbitMQ: ${rabbitError.message}`);
        await logger.error(`Error al cerrar RabbitMQ: ${rabbitError.message}`);
      }

      // Intentar cerrar el pool de la base de datos
      try {
        console.log("[main] Cerrando conexión a la base de datos...");
        await db.pool.end();
        console.log("[main] Conexión a la base de datos cerrada.");
      } catch (dbError) {
        console.error(`[main] Error al cerrar la base de datos: ${dbError.message}`);
        await logger.error(
          `Error al cerrar la base de datos: ${dbError.message}`
        );
      }
    } catch (finalError) {
      console.error(
        `[main] Error inesperado durante el cierre de recursos: ${finalError.message}`
      );
      await logger.error(
        `Error inesperado durante el cierre de recursos: ${finalError.message}`
      );
    }
  }
}

main();
