import bcrypt from 'bcryptjs';
import { config } from '../config';

/** bcrypt (bcryptjs — чистий JS, без нативної збірки в Docker). */
export const hashPassword = (password: string) => bcrypt.hash(password, config.auth.bcryptRounds);

export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);

/** Хеш-заглушка: порівнюємо з ним, коли користувача не знайдено, щоб час відповіді не видавав, чи існує логін. */
export const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 10);

export const MIN_PASSWORD = 8;
