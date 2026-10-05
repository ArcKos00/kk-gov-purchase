// Мінімальні flash-повідомлення через cookie (без сесій). Express сам кодує значення.
const COOKIE = 'flash';

export function flashMiddleware(req, res, next) {
  const raw = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE}=`));
  if (raw) {
    try {
      res.locals.flash = decodeURIComponent(raw.slice(COOKIE.length + 1));
    } catch {
      res.locals.flash = null;
    }
    res.clearCookie(COOKIE);
  }
  req.flash = (message) => res.cookie(COOKIE, message, { httpOnly: true, sameSite: 'lax' });
  next();
}
