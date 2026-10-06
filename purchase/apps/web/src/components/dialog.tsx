import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

/** Модальне вікно на <dialog>: фокус, Esc і затемнення — від браузера. */
export function Modal({ open, onClose, title, children, wide }: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' wide' : ''}`}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-label={title}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-h">
            <h2>{title}</h2>
            <button type="button" className="btn sm ghost" aria-label="Закрити" onClick={onClose}>×</button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** Підтвердження деструктивних дій: `if (await confirm({...})) remove()` */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
        {state?.text && <p className="pre">{state.text}</p>}
        <div className="actions end">
          <button type="button" className="btn" onClick={() => close(false)}>Скасувати</button>
          <button type="button" autoFocus className={`btn ${state?.danger === false ? 'primary' : 'danger solid'}`} onClick={() => close(true)}>
            {state?.confirmText ?? 'Видалити'}
          </button>
        </div>
      </Modal>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm outside ConfirmProvider');
  return ctx;
}
