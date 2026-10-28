import { openDb } from '../db.js';
import { createBackup } from '../services/backup.js';

const db = openDb();
try {
  const backup = await createBackup(db, { prefix: 'manual' });
  console.log(`Backup criado: ${backup.filename} (${(backup.sizeBytes / 1024).toFixed(0)} KB)`);
  console.log(`Local: ${backup.path}`);
} catch (err) {
  console.error('Falha ao criar backup:', err.message);
  process.exitCode = 1;
} finally {
  db.close();
}
