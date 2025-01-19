import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from '../src/db/connection.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigrations() {
  try {
    const migrationsDir = path.join(__dirname);
    const files = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

    for (const file of files) {
      const filePath = path.join(migrationsDir, file);
      const sql = fs.readFileSync(filePath, 'utf8');
      // Ejecutar el SQL en la BD
      await db.query(sql);
      console.log(`Migración ejecutada: ${file}`);
    }
    console.log('Todas las migraciones se han ejecutado correctamente.');
    process.exit(0);
  } catch (error) {
    console.error('Error ejecutando migraciones:', error);
    process.exit(1);
  }
}

runMigrations();
