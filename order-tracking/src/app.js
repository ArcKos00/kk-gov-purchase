import path from 'node:path';
import express from 'express';
import multer from 'multer';
import { rootDir, config } from './config.js';
import * as format from './lib/format.js';
import { flashMiddleware } from './lib/flash.js';
import { router as contracts } from './routes/contracts.js';
import { router as deliveries } from './routes/deliveries.js';
import { router as files } from './routes/files.js';

export function createApp() {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(rootDir, 'views'));
  app.disable('x-powered-by');

  app.locals.f = format;

  app.use('/static', express.static(path.join(rootDir, 'public')));
  app.use('/static/bootstrap', express.static(path.join(rootDir, 'node_modules/bootstrap/dist')));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(flashMiddleware);

  app.get('/', (req, res) => res.redirect('/contracts'));
  app.use('/contracts', contracts);
  app.use('/', deliveries);
  app.use('/files', files);

  app.use((req, res) => res.status(404).render('error', { title: 'Не знайдено', message: 'Сторінку не знайдено.' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).render('error', {
        title: 'Файл завеликий',
        message: `Максимальний розмір файлу — ${config.maxUploadMb} МБ.`,
      });
    }
    console.error(err);
    res.status(500).render('error', { title: 'Помилка', message: 'Не вдалося обробити запит. Спробуйте ще раз.' });
  });

  return app;
}
