import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';
import { badRequest } from '../utils/errors.js';

const ALLOWED_MIME = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
]);

const storage = multer.diskStorage({
  destination(_req, _file, cb) {
    fs.mkdirSync(config.uploadDir, { recursive: true });
    cb(null, config.uploadDir);
  },
  filename(_req, file, cb) {
    const ext = ALLOWED_MIME.get(file.mimetype) || '.jpg';
    cb(null, `${Date.now()}-${crypto.randomUUID()}${ext}`);
  },
});

export const uploadCartPhoto = multer({
  storage,
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter(_req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(badRequest('Envie uma imagem JPG, PNG ou WebP.'));
    }
    cb(null, true);
  },
}).single('foto');

function magicMatches(filePath, mime) {
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(12);
  try {
    fs.readSync(fd, buffer, 0, 12, 0);
  } finally {
    fs.closeSync(fd);
  }
  if (mime === 'image/jpeg') return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mime === 'image/png') return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mime === 'image/webp') {
    return buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP';
  }
  return false;
}

/** Valida o conteúdo real do arquivo (não apenas o mimetype enviado). */
export function validateUploadedPhoto(file) {
  if (!file) return;
  if (!magicMatches(file.path, file.mimetype)) {
    removeUploadedFile(file.filename);
    throw badRequest('O arquivo não é uma imagem válida.');
  }
}

export function uploadedPhotoUrl(file) {
  return file ? `/uploads/${file.filename}` : null;
}

export function removeUploadedFile(filename) {
  if (!filename) return;
  const safe = path.basename(filename);
  const target = path.resolve(config.uploadDir, safe);
  if (!target.startsWith(path.resolve(config.uploadDir) + path.sep)) return;
  fs.rm(target, { force: true }, () => {});
}

export function removeUploadedByUrl(url) {
  if (!url || !url.startsWith('/uploads/')) return;
  removeUploadedFile(url.slice('/uploads/'.length));
}
