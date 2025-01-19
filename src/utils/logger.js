import { createLogger, format, transports } from "winston";
import { saveExecutionLog } from "../db/depositRepository.js";

// Formato base para archivos de log
const logFormat = format.combine(
  format.timestamp(),
  format.printf(
    ({ timestamp, level, message }) =>
      `[${timestamp}] ${level.toUpperCase()}: ${message}`
  )
);

// Formato simplificado para la consola (sin IDs ni timestamps)
const consoleFormat = format.printf(({ message }) => `${message}`);

// Logger base para archivos de log
const baseLogger = createLogger({
  level: "info",
  format: logFormat,
  transports: [
    new transports.File({ filename: "logs/error.log", level: "error" }),
    new transports.File({ filename: "logs/combined.log" }),
  ],
  exceptionHandlers: [new transports.File({ filename: "logs/exceptions.log" })],
});

// Logger para la consola (formato limpio)
const consoleLogger = createLogger({
  level: "info",
  format: consoleFormat,
  transports: [new transports.Console()],
});

// Logger contextualizado por ejecución
export function createExecutionLogger(executionId) {
  return {
    info: async (message, isConsoleOnly = false) => {
      const logMessage = `[Execution ID: ${executionId}] ${message}`;
      if (isConsoleOnly) {
        consoleLogger.info(message); // Solo imprime en consola
      } else {
        baseLogger.info(logMessage); // Guarda en los archivos
        try {
          await saveExecutionLog({
            executionId,
            logLevel: "INFO",
            message,
          });
        } catch (error) {
          baseLogger.error(
            `Error al guardar log en la base de datos: ${error.message}`
          );
        }
      }
    },
    error: async (message) => {
      const logMessage = `[Execution ID: ${executionId}] ${message}`;
      baseLogger.error(logMessage); // Guarda en los archivos
      try {
        await saveExecutionLog({
          executionId,
          logLevel: "ERROR",
          message,
        });
      } catch (error) {
        baseLogger.error(
          `Error al guardar log en la base de datos: ${error.message}`
        );
      }
    },
  };
}

export { baseLogger as logger };
