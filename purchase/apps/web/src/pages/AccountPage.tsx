import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { ROLE_TEXT } from '../lib/format';
import { useAuth } from '../auth/auth';
import { useToast } from '../components/toast';
import { FieldError, FormError, PageHead, useFieldErrors } from '../components/ui';

export function AccountPage() {
  const { me } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', repeat: '' });
  const save = useMutation({
    mutationFn: async () => {
      if (form.newPassword !== form.repeat) throw new ApiError(422, 'Перевірте введені дані', { repeat: 'Паролі не збігаються' });
      await api.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
    },
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', repeat: '' });
      toast.ok('Пароль змінено. Сесії на інших пристроях завершено.');
    },
  });
  const { err, touch } = useFieldErrors(save.error);
  const field = (k: keyof typeof form) => (e: { target: { value: string } }) => {
    setForm({ ...form, [k]: e.target.value });
    touch(k);
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <>
      <PageHead title="Обліковий запис" subtitle={me && `${me.fullName} · ${me.login} · ${ROLE_TEXT[me.role]}`} />
      <form className="panel panel-b stack narrow-form" onSubmit={submit} noValidate>
        <h2>Зміна пароля</h2>
        <FormError error={save.error && !['currentPassword', 'newPassword', 'repeat'].some((k) => err(k)) ? save.error : null} />
        <label className="f">Поточний пароль
          <input type="password" autoComplete="current-password" value={form.currentPassword} onChange={field('currentPassword')} className={err('currentPassword') ? 'invalid' : ''} />
          <FieldError message={err('currentPassword')} />
        </label>
        <label className="f">Новий пароль (щонайменше 8 символів)
          <input type="password" autoComplete="new-password" value={form.newPassword} onChange={field('newPassword')} className={err('newPassword') ? 'invalid' : ''} />
          <FieldError message={err('newPassword')} />
        </label>
        <label className="f">Повторіть новий пароль
          <input type="password" autoComplete="new-password" value={form.repeat} onChange={field('repeat')} className={err('repeat') ? 'invalid' : ''} />
          <FieldError message={err('repeat')} />
        </label>
        <div className="actions"><button className="btn primary" type="submit" disabled={save.isPending}>Змінити пароль</button></div>
      </form>
    </>
  );
}
