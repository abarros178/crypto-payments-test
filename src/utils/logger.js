import { createLogger, format, transports } from 'winston';
import { saveExecutionLog } from '../db/depositRepository.js';

// Logger base para consola
const baseLogger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level.toUpperCase()}: ${message}`)
  ),
  transports: [new transports.Console()],
});

// Logger contextualizado por ejecución
export function createExecutionLogger(executionId) {
  return {
    info: async (message) => {
      baseLogger.info(`[Execution ID: ${executionId}] ${message}`);
      await saveExecutionLog({
        executionId,
        logLevel: 'INFO',
        message,
      });
    },
    error: async (message) => {
      baseLogger.error(`[Execution ID: ${executionId}] ${message}`);
      await saveExecutionLog({
        executionId,
        logLevel: 'ERROR',
        message,
      });
    },
  };
}

export { baseLogger as logger };
