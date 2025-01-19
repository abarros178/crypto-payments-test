import pg from "pg";
import { POSTGRES_CONFIG } from "../config/index.js";
import { handleError } from "../utils/errorHandler.js";

const { Pool } = pg;

const pool = new Pool({
  host: POSTGRES_CONFIG.host,
  port: POSTGRES_CONFIG.port,
  user: POSTGRES_CONFIG.user,
  password: POSTGRES_CONFIG.password,
  database: POSTGRES_CONFIG.database,
  max: 10,
});

// Manejo de errores a nivel de pool
pool.on("error", (err) => {
  handleError(err, "PostgreSQL Pool"); // Manejar errores de conexión del pool
});

// Exportar el objeto con manejo centralizado de errores
export default {
  /**
   * Ejecuta una consulta en la base de datos.
   *
   * @param {string} text - Texto de la consulta SQL.
   * @param {Array} params - Parámetros para la consulta.
   * @returns {Promise} - Resultado de la consulta.
   */
  query: async (text, params) => {
    try {
      return await pool.query(text, params);
    } catch (error) {
      handleError(error, "PostgreSQL Query"); // Manejar errores de consulta
      throw error; // Re-lanzar el error para que las funciones superiores puedan manejarlo
    }
  },
  pool, // Exporta el pool para operaciones avanzadas si es necesario
};
