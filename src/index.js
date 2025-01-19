import { logger } from "./utils/logger.js";
import {
  processTransactions,
  aggregateValidDeposits,
} from "./services/transactionProcessor.js";
import { saveExecutionLog } from "./db/depositRepository.js";
import db from "./db/connection.js";
import { v4 as uuidv4 } from 'uuid';

async function main() {
  const executionId = uuidv4();  // ID único por ejecución

  try {
    // Log de inicio de ejecución
    await saveExecutionLog({
      executionId,
      logLevel: 'INFO',
      message: `Ejecución ${executionId} iniciada.`,
    });

    // Procesar transacciones
    await processTransactions(executionId);
    await saveExecutionLog({
      executionId,
      logLevel: 'INFO',
      message: `Procesamiento de transacciones completado.`,
    });

    // Agregar estadísticas de depósitos válidos
    const { stats, smallest, largest } = await aggregateValidDeposits();

    const customers = [
      "Wesley Crusher",
      "Leonard McCoy",
      "Jonathan Archer",
      "Jadzia Dax",
      "Montgomery Scott",
      "James T. Kirk",
      "Spock",
    ];

    // Registro de los resultados por cliente
    for (const name of customers) {
      const { count, sum } = stats.known[name] || { count: 0, sum: 0.0 };
      const message = `Deposited for ${name}: count=${count} sum=${sum.toFixed(8)}`;
      console.log(message);
      await saveExecutionLog({
        executionId,
        logLevel: 'INFO',
        message,
      });
    }

    // Registro de depósitos sin referencia
    const { count, sum } = stats.unknown || { count: 0, sum: 0.0 };
    const unknownMessage = `Deposited without reference: count=${count} sum=${sum.toFixed(8)}`;
    console.log(unknownMessage);
    await saveExecutionLog({
      executionId,
      logLevel: 'INFO',
      message: unknownMessage,
    });

    // Registro de los depósitos más pequeños y más grandes
    const smallestMessage = `Smallest valid deposit: ${smallest.toFixed(8)}`;
    const largestMessage = `Largest valid deposit: ${largest.toFixed(8)}`;
    console.log(smallestMessage);
    console.log(largestMessage);

    await saveExecutionLog({
      executionId,
      logLevel: 'INFO',
      message: smallestMessage,
    });

    await saveExecutionLog({
      executionId,
      logLevel: 'INFO',
      message: largestMessage,
    });

    // Finalizar ejecución exitosamente
    await saveExecutionLog({
      executionId,
      logLevel: 'INFO',
      message: `Ejecución ${executionId} finalizada correctamente.`,
    });

    // Cerrar conexión a la base de datos
    await db.pool.end();

  } catch (error) {
    // Registrar error en logger y base de datos
    await saveExecutionLog({
      executionId,
      logLevel: 'ERROR',
      message: `Error: ${error.message}`,
    });

    process.exit(1);
  }
}

main();
