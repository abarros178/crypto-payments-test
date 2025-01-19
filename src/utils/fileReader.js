import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function readJsonFile(filename) {
  const filePath = path.join(__dirname, '../../data', filename);
  const content = await fs.readFile(filePath, 'utf8');
  return JSON.parse(content);
}
