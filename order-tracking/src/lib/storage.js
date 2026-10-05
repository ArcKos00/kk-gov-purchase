import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { config } from '../config.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

// multer віддає ім'я файлу в latin1 — перекодовуємо, щоб кирилиця не ламалась.
const decodeName = (name) => Buffer.from(name, 'latin1').toString('utf8');

export const upload = multer({
  storage: multer.diskStorage({
    destination: config.uploadsDir,
    filename: (req, file, cb) => {
      let ext = path.extname(decodeName(file.originalname)).toLowerCase();
      if (!/^\.[a-z0-9]{1,10}$/.test(ext)) ext = '';
      cb(null, crypto.randomUUID().replaceAll('-', '') + ext);
    },
  }),
  limits: { fileSize: config.maxUploadMb * 1024 * 1024 },
});

/** Зберігає метадані завантаженого файлу в БД, повертає id. */
export async function saveFileRecord(client, file) {
  if (!file) return null;
  const { rows } = await client.query(
    `INSERT INTO files (original_name, stored_name, content_type, size)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [decodeName(file.originalname), file.filename, file.mimetype || 'application/octet-stream', file.size],
  );
  return rows[0].id;
}

export function filePath(storedName) {
  return path.join(config.uploadsDir, path.basename(storedName));
}

export function removeStoredFile(storedName) {
  fs.rm(filePath(storedName), { force: true }, () => {});
}

/** Прибирає з диска щойно завантажений файл, якщо форма не пройшла валідацію. */
export function discardUpload(file) {
  if (file) removeStoredFile(file.filename);
}
