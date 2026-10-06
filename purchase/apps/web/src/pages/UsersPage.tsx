import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Role, UserCreateInput, UserInfo } from '@kk-gov-purchase/shared';
import { api } from '../lib/api';
import { fdatetime, ROLE_TEXT } from '../lib/format';
import { useAuth } from '../auth/auth';
import { Modal, useConfirm } from '../components/dialog';
import { useToast } from '../components/toast';
import { errorText, FieldError, FormError, LoadError, Loading, PageHead, useFieldErrors } from '../components/ui';

const ROLES = Object.keys(ROLE_TEXT) as Role[];
const ROLE_HINT: Record<Role, string> = {
  admin: 'усе, включно з користувачами та журналом дій',
  editor: 'перегляд і зміна договорів, поставок, файлів',
  viewer: 'лише перегляд, пошук і аналітика',
};

/** Пароль, який зручно продиктувати: 12 символів без схожих літер. */
function generatePassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function CreateUser({ onDone }: { onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = useState<UserCreateInput>({ login: '', fullName: '', role: 'editor', password: generatePassword() });
  const save = useMutation({
    mutationFn: () => api.createUser(form),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.ok(`Користувача ${u.login} створено. Передайте йому пароль.`);
      onDone();
    },
  });
  const { err, touch } = useFieldErrors(save.error);
  const field = (k: keyof UserCreateInput) => (e: { target: { value: string } }) => {
    setForm({ ...form, [k]: e.target.value });
    touch(k);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} noValidate className="stack">
      <FormError error={save.error && !Object.keys(form).some((k) => err(k)) ? save.error : null} />
      <label className="f">ПІБ<input autoFocus value={form.fullName} onChange={field('fullName')} className={err('fullName') ? 'invalid' : ''} /><FieldError message={err('fullName')} /></label>
      <label className="f">Логін або email<input value={form.login} onChange={field('login')} autoComplete="off" className={err('login') ? 'invalid' : ''} /><FieldError message={err('login')} /></label>
      <label className="f">Роль
        <select value={form.role} onChange={field('role')}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_TEXT[r]} — {ROLE_HINT[r]}</option>)}
        </select>
      </label>
      <label className="f">Початковий пароль
        <div className="input-group">
          <input value={form.password} onChange={field('password')} className={`num${err('password') ? ' invalid' : ''}`} autoComplete="new-password" />
          <button type="button" className="btn sm" onClick={() => setForm({ ...form, password: generatePassword() })}>Згенерувати</button>
        </div>
        <FieldError message={err('password')} />
      </label>
      <div className="actions end">
        <button type="button" className="btn" onClick={onDone}>Скасувати</button>
        <button className="btn primary" type="submit" disabled={save.isPending}>{save.isPending ? 'Створення…' : 'Створити'}</button>
      </div>
    </form>
  );
}

function ResetPassword({ user, onDone }: { user: UserInfo; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [password, setPassword] = useState(generatePassword);
  const save = useMutation({
    mutationFn: () => api.resetPassword(user.id, password),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.ok(`Пароль для ${user.login} змінено, усі його сесії завершено.`);
      onDone();
    },
  });
  const { err } = useFieldErrors(save.error);
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} noValidate className="stack">
      <p className="muted">Новий пароль для <b>{user.fullName}</b> ({user.login}). Блокування знімається, усі сесії користувача завершуються.</p>
      <label className="f">Новий пароль
        <div className="input-group">
          <input autoFocus value={password} onChange={(e) => setPassword(e.target.value)} className="num" autoComplete="new-password" />
          <button type="button" className="btn sm" onClick={() => setPassword(generatePassword())}>Згенерувати</button>
        </div>
        <FieldError message={err('password')} />
      </label>
      <FormError error={save.error && !err('password') ? save.error : null} />
      <div className="actions end">
        <button type="button" className="btn" onClick={onDone}>Скасувати</button>
        <button className="btn primary" type="submit" disabled={save.isPending}>Змінити пароль</button>
      </div>
    </form>
  );
}

export function UsersPage() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<UserInfo | null>(null);
  const { data, error, isPending, refetch } = useQuery({ queryKey: ['users'], queryFn: api.users });

  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: number; role?: Role; active?: boolean }) => api.updateUser(id, patch),
    onSuccess: (u) => {
      qc.invalidateQueries({ queryKey: ['users'] });
      toast.ok(`Зміни для ${u.login} збережено.`);
    },
    onError: (e) => toast.error(errorText(e)),
  });

  const toggleActive = async (u: UserInfo) => {
    if (u.active && !(await confirm({
      title: `Вимкнути ${u.fullName}?`,
      text: 'Користувач не зможе увійти, його поточні сесії буде завершено. Увімкнути назад можна будь-коли.',
      confirmText: 'Вимкнути',
    }))) return;
    update.mutate({ id: u.id, active: !u.active });
  };

  return (
    <>
      <PageHead title="Користувачі" subtitle="Доступ до застосунку і ролі"
        actions={<button type="button" className="btn primary" onClick={() => setCreating(true)}>＋ Новий користувач</button>} />
      {isPending ? <Loading /> : error ? <LoadError error={error} onRetry={() => void refetch()} /> : (
        <div className="panel tbl-box">
          <table>
            <thead><tr><th>ПІБ</th><th>Логін</th><th>Роль</th><th>Останній вхід</th><th>Стан</th><th /></tr></thead>
            <tbody>
              {data.map((u) => {
                const self = u.id === me?.id;
                return (
                  <tr key={u.id} className={u.active ? '' : 'muted'}>
                    <td>{u.fullName}{self && <span className="small muted"> (це ви)</span>}</td>
                    <td className="num small">{u.login}</td>
                    <td>
                      <select aria-label={`Роль ${u.login}`} value={u.role} disabled={self || update.isPending}
                        onChange={(e) => update.mutate({ id: u.id, role: e.target.value as Role })} style={{ width: 'auto' }}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_TEXT[r]}</option>)}
                      </select>
                    </td>
                    <td className="small num tight">{fdatetime(u.lastLoginAt)}</td>
                    <td className="small">
                      {u.active ? <span className="pill st-completed">Активний</span> : <span className="pill st-waiting">Вимкнено</span>}
                      {u.lockedUntil && <div className="c-danger">заблоковано до {fdatetime(u.lockedUntil)}</div>}
                    </td>
                    <td className="r tight">
                      <span className="actions end">
                        <Link className="btn sm" to={`/admin/audit?userId=${u.id}`}>Дії</Link>
                        <button type="button" className="btn sm" onClick={() => setResetFor(u)}>Пароль</button>
                        {!self && (
                          <button type="button" className={`btn sm${u.active ? ' danger' : ''}`} onClick={() => void toggleActive(u)} disabled={update.isPending}>
                            {u.active ? 'Вимкнути' : 'Увімкнути'}
                          </button>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="Новий користувач">
        <CreateUser onDone={() => setCreating(false)} />
      </Modal>
      <Modal open={!!resetFor} onClose={() => setResetFor(null)} title="Скидання пароля">
        {resetFor && <ResetPassword user={resetFor} onDone={() => setResetFor(null)} />}
      </Modal>
    </>
  );
}
