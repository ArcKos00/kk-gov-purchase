import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type Kind = 'ok' | 'bad' | 'info';
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

interface ToastApi {
  ok: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

/** Короткі сповіщення в кутку екрана (зберегли, видалили, помилка). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, text: string) => {
    const id = next.current++;
    setToasts((list) => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => dismiss(id), kind === 'bad' ? 8000 : 4000);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    ok: (t) => push('ok', t),
    error: (t) => push('bad', t),
    info: (t) => push('info', t),
  }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            <span>{t.text}</span>
            <button type="button" className="toast-x" aria-label="Закрити" onClick={() => dismiss(t.id)}>×</button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast outside ToastProvider');
  return ctx;
}
