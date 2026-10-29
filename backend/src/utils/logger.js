import fs from 'node:fs';
import path from 'node:path';

let installed = false;

function serialize(args) {
  return args
    .map((value) => {
      if (typeof value === 'string') return value;
      if (value instanceof Error) return value.stack || value.message;
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(' ');
}

/** Espelha console.* para um arquivo local, mantendo o terminal. */
export function installFileLogger(logPath) {
  if (installed || !logPath) return;
  installed = true;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const stream = fs.createWriteStream(logPath, { flags: 'a' });
  const methods = ['log', 'info', 'warn', 'error', 'debug'];
  for (const method of methods) {
    const original = console[method].bind(console);
    console[method] = (...args) => {
      original(...args);
      stream.write(`${new Date().toISOString()} [${method}] ${serialize(args)}\n`);
    };
  }
}
