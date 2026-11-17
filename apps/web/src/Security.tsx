import { useQuery } from '@tanstack/react-query';
import { watermarkWho, type SecurityTexts } from '@k2/security';
import { K2Security } from '@k2/security/react';
import '@k2/security/security.css';
import { meQuery } from './user';

/** id застосунку — як у сервера (apps/api/src/security/security.ts) і в подіях (`service.name`). */
export const SECURITY_APP = 'gov-purchase';
export const SECURITY_TITLE = 'Облік замовлень';

/**
 * Що друкується замість сторінки. Свій текст: бібліотечний («Дані {app} не друкуються…») з назвою застосунку
 * не узгоджується і радить експорт. Сталий об'єкт: K2Security перемонтовує захист, коли `texts` змінюється.
 */
const TEXTS: SecurityTexts = {
  printTitle: 'Друк заборонено',
  printBody: 'Дані обліку замовлень не друкуються.',
};

/**
 * Безпековий шаблон К-2 (`@k2/security`): водяний знак «Ім'я (логін) · дата час» поверх усіх екранів — і на
 * сторінці входу, і в анонімному перегляді (там, поки людина невідома, — «Облік замовлень», так само офлайн чи
 * коли сервер не відповів) — і заборона друку (`@media print` — лише попередження, знак лишається). Заборони
 * скріншотів немає свідомо — знак робить знімок не анонімним.
 *
 * Стоїть у main.tsx поза App і роутером — отже на всіх сторінках. Політику питає раз на завантаження сторінки
 * (`/k2-security/policy`, `no-store`); поки її немає чи вона не прочиталась — усе ввімкнено (fail-closed).
 * Вхід і вихід — повне перезавантаження сторінки, тож політика завжди про того, хто зараз у сесії.
 * Події (спроба друку, підробка знака) — `/k2-security/events`; без входу сервер відповідає 401, так і задумано.
 * Нічого не рендерить: знак — елемент під <html> поза React.
 */
export function Security() {
  // `me` як він уже є (App його питає) — звідси сервер не питаємо; лише на знак, якщо політика людини не назве
  const me = useQuery({ ...meQuery, enabled: false }).data;
  const who = me ? watermarkWho(me.displayName, me.username) : null;
  return (
    <K2Security
      app={SECURITY_APP}
      title={SECURITY_TITLE}
      policyUrl="/k2-security/policy"
      eventsUrl="/k2-security/events"
      texts={TEXTS}
      who={who}
    />
  );
}
