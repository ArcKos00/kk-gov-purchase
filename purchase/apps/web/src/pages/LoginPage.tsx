import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '../auth/auth';
import { FieldError, FormError, useFieldErrors } from '../components/ui';

/** Безпечна адреса повернення: лише внутрішній шлях. */
const safeNext = (next: string | null) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/contracts');

export function LoginPage() {
  const { me, login } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ login: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);
  const { err, touch } = useFieldErrors(error);

  if (me) return <Navigate to={safeNext(params.get('next'))} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setPending(true);
    setError(null);
    try {
      await login(form);
      navigate(safeNext(params.get('next')), { replace: true });
    } catch (ex) {
      setError(ex);
      setForm((f) => ({ ...f, password: '' }));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="login-page">
      <form className="panel login-card" onSubmit={submit} noValidate>
        <div className="login-brand">
          <span className="brand-mark" aria-hidden>₴</span>
          <div>
            <h1>Облік закупівель</h1>
            <div className="muted small">Увійдіть, щоб продовжити</div>
          </div>
        </div>
        <FormError error={error && !(err('login') || err('password')) ? error : null} />
        <label className="f">Логін або email
          <input id="l-login" autoFocus autoComplete="username" value={form.login} className={err('login') ? 'invalid' : ''}
            onChange={(e) => { setForm({ ...form, login: e.target.value }); touch('login'); }} />
          <FieldError message={err('login')} />
        </label>
        <label className="f">Пароль
          <input id="l-password" type="password" autoComplete="current-password" value={form.password} className={err('password') ? 'invalid' : ''}
            onChange={(e) => { setForm({ ...form, password: e.target.value }); touch('password'); }} />
          <FieldError message={err('password')} />
        </label>
        <button className="btn primary block" type="submit" disabled={pending}>{pending ? 'Вхід…' : 'Увійти'}</button>
        <p className="small muted">Немає доступу або забули пароль? Зверніться до адміністратора.</p>
      </form>
    </div>
  );
}
