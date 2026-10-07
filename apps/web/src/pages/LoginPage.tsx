import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { FormError } from '../components/ui';

export function LoginPage() {
  const queryClient = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const login = useMutation({
    mutationFn: api.login,
    onSuccess: (user) => queryClient.setQueryData(['me'], user),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ username, password });
  };

  return (
    <main className="wrap login">
      <form className="panel panel-b login-form" onSubmit={submit}>
        <h1>Облік замовлень</h1>
        <p className="muted small">Увійдіть, щоб продовжити.</p>
        <FormError error={login.error} />
        <label className="f">Логін
          <input name="username" autoComplete="username" autoFocus required value={username} onChange={(e) => setUsername(e.target.value)} />
        </label>
        <label className="f">Пароль
          <input name="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn primary" type="submit" disabled={login.isPending}>
          {login.isPending ? 'Вхід…' : 'Увійти'}
        </button>
      </form>
    </main>
  );
}
