import { Controller, MessageEvent, Req, Sse } from '@nestjs/common';
import { ApiCookieAuth, ApiOperation, ApiProduces, ApiTags } from '@nestjs/swagger';
import { interval, map, merge, Observable, takeUntil, timer } from 'rxjs';
import type { SessionRequest } from '../auth/session';
import { EventsService } from './events.service';
import { Viewable } from '../auth/auth.guard';

/** Коментар-пінг, щоб ingress/haproxy не рвали «тихе» з'єднання за таймаутом. */
const PING_MS = 25_000;

@ApiTags('Живі оновлення')
@ApiCookieAuth('sid')
@Controller('events')
export class EventsController {
  constructor(private readonly live: EventsService) {}

  /** Потік змін (SSE) для всіх відкритих вкладок. Закривається, коли закінчується вхід; без входу — для перегляду. */
  @ApiOperation({ summary: 'Потік змін (SSE)', description: 'text/event-stream: нове чи змінене іншими користувачами; пінг кожні 25 с.' })
  @ApiProduces('text/event-stream')
  @Sse()
  @Viewable()
  stream(@Req() req: SessionRequest): Observable<MessageEvent> {
    const events = merge(
      this.live.events.pipe(map((data): MessageEvent => ({ data }))),
      interval(PING_MS).pipe(map((): MessageEvent => ({ type: 'ping', data: '' }))),
    );
    const expiresAt = req.session?.expiresAt;
    return expiresAt ? events.pipe(takeUntil(timer(Math.max(0, expiresAt - Date.now())))) : events;
  }
}
