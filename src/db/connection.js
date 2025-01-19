import pg from 'pg';
import { POSTGRES_CONFIG } from '../config/index.js';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

const pool = new Pool({
  host: POSTGRES_CONFIG.host,
  port: POSTGRES_CONFIG.port,
  user: POSTGRES_CONFIG.user,
  password: POSTGRES_CONFIG.password,
  database: POSTGRES_CONFIG.database,
  max: 10 // Máximo de conexiones simultáneas
});

// Manejo de errores a nivel de pool
pool.on('error', (err) => {
  logger.error('Error inesperado en el pool de PostgreSQL', err);
});

export default {
  query: (text, params) => pool.query(text, params),
  pool,  // <-- EXPORTA EL POOL AQUÍ
};
