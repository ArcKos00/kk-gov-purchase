import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const config = {
  port: Number(process.env.PORT ?? 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders',
  uploadsDir: path.resolve(rootDir, process.env.UPLOADS_DIR ?? 'data/uploads'),
  maxUploadMb: Number(process.env.MAX_UPLOAD_MB ?? 50),
};
