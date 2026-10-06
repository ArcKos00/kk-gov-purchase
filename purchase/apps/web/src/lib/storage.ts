/** localStorage з try/catch: у приватному режимі або з вимкненим сховищем просто нічого не запам'ятовуємо. */
export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const RECENT = 'pt.recentSearches';

export const recentSearches = () => load<string[]>(RECENT, []);

export function rememberSearch(q: string) {
  const v = q.trim();
  if (v.length < 2) return;
  save(RECENT, [v, ...recentSearches().filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(0, 8));
}

export const clearRecentSearches = () => save(RECENT, []);

export interface SavedFilter {
  name: string;
  /** query string без "?" */
  query: string;
}

const SAVED = 'pt.savedFilters';
export const savedFilters = () => load<SavedFilter[]>(SAVED, []);
export const setSavedFilters = (list: SavedFilter[]) => save(SAVED, list);
