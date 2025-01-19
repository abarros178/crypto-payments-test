import { logger } from "./logger.js";
import {
  DatabaseError,
  FileProcessingError,
  TransactionValidationError,
  ConnectionError,
  AppError,
} from "../utils/errors.js";


/**
 * Maneja errores de forma centralizada.
 * 
 * @param {Error} error - Instancia del error.
 * @param {string} context - Contexto donde ocurrió el error (función, módulo, etc.).
 * @throws {Error} Re-lanza errores críticos si es necesario.
 */
export function handleError(error, context = "General") {
  
  if (error instanceof DatabaseError) {
    logger.error(`📂 [DatabaseError] (${context}): ${error.message}`);
  } else if (error instanceof FileProcessingError) {
    logger.error(`📁 [FileProcessingError] (${context}): ${error.message}`);
  } else if (error instanceof TransactionValidationError) {
    logger.warn(`⚠️ [TransactionValidationError] (${context}): ${error.message}`);
  } else if (error instanceof ConnectionError) {
    logger.error(`🔌 [ConnectionError] (${context}): ${error.message}`);
  } else if (error instanceof AppError) {
    logger.error(`❗ [AppError] (${context}): ${error.message}`);
  } else {
    // Error inesperado
    logger.error(`❌ [UnexpectedError] (${context}): ${error.message}`);
    throw error; // Re-lanza errores inesperados para no silenciarlos
  }
}
