import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Тести працюють з окремою БД, яку повністю очищують перед кожним файлом тестів.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/orders_test';
process.env.UPLOADS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'orders-uploads-'));
process.env.WEB_DIST = path.join(os.tmpdir(), 'no-web-dist');
process.env.ADMIN_LOGIN = 'admin';
process.env.ADMIN_PASSWORD = 'admin-password-1';
process.env.ADMIN_NAME = 'Головний Адміністратор';
process.env.BCRYPT_ROUNDS = '4';
process.env.LOGIN_MAX_ATTEMPTS = '3';
process.env.LOGIN_IP_ATTEMPTS = '1000';
