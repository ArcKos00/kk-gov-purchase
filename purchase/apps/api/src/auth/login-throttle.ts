import { Injectable } from '@nestjs/common';
import { config } from '../config';

const WINDOW = 15 * 60_000;

/**
 * Обмеження спроб входу з однієї IP (у пам'яті: застосунок працює однією реплікою).
 * Окремо від цього AuthService тимчасово блокує сам обліковий запис після N невдалих спроб поспіль.
 */
@Injectable()
export class LoginThrottle {
  private readonly failures = new Map<string, number[]>();

  private recent(ip: string, now = Date.now()) {
    const list = (this.failures.get(ip) ?? []).filter((t) => now - t < WINDOW);
    if (list.length) this.failures.set(ip, list);
    else this.failures.delete(ip);
    return list;
  }

  /** Скільки секунд чекати, якщо ліміт вичерпано; 0 — можна пробувати. */
  retryAfter(ip: string): number {
    const list = this.recent(ip);
    if (list.length < config.auth.ipAttemptsPer15Min) return 0;
    return Math.ceil((list[0] + WINDOW - Date.now()) / 1000);
  }

  fail(ip: string) {
    const list = this.recent(ip);
    list.push(Date.now());
    this.failures.set(ip, list);
    if (this.failures.size > 10_000) this.failures.delete(this.failures.keys().next().value!);
  }

  reset(ip: string) {
    this.failures.delete(ip);
  }
}
