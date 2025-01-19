import { MIN_CONFIRMATIONS } from "../config/index.js";
/**
 * Valida el formato de una transacción.
 * Lanza un error si algún campo requerido no está presente o es inválido.
 *
 * @param {Object} tx - Transacción a validar.
 * @throws {Error} Si la transacción es inválida.
 */
export function validateTransaction(tx) {
  if (
    typeof tx?.txid !== "string" ||
    typeof tx?.address !== "string" ||
    typeof tx?.amount !== "number" ||
    typeof tx?.confirmations !== "number" ||
    typeof tx?.category !== "string"
  ) {
    throw new Error(`Transacción inválida: ${JSON.stringify(tx)}`);
  }
}
/**
 * Determina si una transacción es un depósito válido.
 *
 * @param {Object} tx - Transacción a verificar.
 * @returns {boolean} Verdadero si el depósito es válido; falso en caso contrario.
 */
export function isValidDeposit(tx) {
  return (
    tx.category === "receive" && // La categoría debe ser "receive"
    tx.amount > 0 && // La cantidad debe ser mayor a 0
    tx.confirmations >= MIN_CONFIRMATIONS // Confirmaciones mínimas
  );
}
/**
 * Devuelve la razón por la cual una transacción no es válida.
 *
 * @param {Object} tx - Transacción a analizar.
 * @returns {string} Razón de la invalidez.
 */
export function getFailureReason(tx) {
  if (tx.category !== "receive") return "Categoría inválida";
  if (tx.amount <= 0) return "Monto negativo o cero";
  if (tx.confirmations < MIN_CONFIRMATIONS)
    return "Confirmaciones insuficientes";
  return null; // Es válida
}
