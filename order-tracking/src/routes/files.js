import fs from 'node:fs';
import { Router } from 'express';
import { query } from '../db.js';
import { filePath } from '../lib/storage.js';

export const router = Router();

router.get('/:id', async (req, res, next) => {
  if (!/^\d+$/.test(req.params.id)) return next();
  const { rows: [file] } = await query('SELECT * FROM files WHERE id = $1', [req.params.id]);
  if (!file || !fs.existsSync(filePath(file.stored_name))) return next();

  // Завжди як вкладення, щоб завантажений HTML/SVG не виконувався в браузері.
  res.attachment(file.original_name);
  res.type(file.content_type);
  res.set('X-Content-Type-Options', 'nosniff');
  res.sendFile(filePath(file.stored_name));
});
