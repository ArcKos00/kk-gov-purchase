import { useEffect, useState } from 'react';
import { load, save } from '../lib/storage';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'pt.theme';

function apply(theme: Theme) {
  if (theme === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}

/** Тема: як у системі / світла / темна. Вибір пам'ятається в браузері. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => load<Theme>(KEY, 'system'));
  useEffect(() => {
    apply(theme);
    save(KEY, theme);
  }, [theme]);
  const cycle = () => setTheme((t) => (t === 'system' ? 'light' : t === 'light' ? 'dark' : 'system'));
  return { theme, cycle };
}

// Застосовуємо одразу, щоб не було спалаху світлої теми.
apply(load<Theme>(KEY, 'system'));
