import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY.padEnd(32, "0").slice(0, 32); // Ajusta la longitud a 32 bytes
const IV_LENGTH = 16; // 16 bytes para AES

/**
 * Encripta un texto usando AES-256-CBC.
 *
 * @param {string} text - Texto a encriptar.
 * @returns {string} - Texto encriptado en base64.
 */
export function encrypt(text) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Desencripta un texto encriptado usando AES-256-CBC.
 *
 * @param {string} encryptedText - Texto encriptado en base64.
 * @returns {string} - Texto desencriptado.
 */
export function decrypt(encryptedText) {
  const [ivHex, encryptedHex] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const encrypted = Buffer.from(encryptedHex, "hex");
  const decipher = crypto.createDecipheriv("aes-256-cbc", Buffer.from(ENCRYPTION_KEY), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}
