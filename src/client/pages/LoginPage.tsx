import React, { useState } from 'react';
import { apiFetch, SessionInfo } from '../api';
import { AlertBanner, btnPrimaryCls, inputCls } from '../components/ui';

const DEMO_ACCOUNTS = [
  { role: 'Administrator', username: 'admin', password: 'admin12345' },
  { role: 'Teacher', username: 'teacher', password: 'teacher12345' },
  { role: 'Adviser', username: 'adviser', password: 'adviser12345' },
  { role: 'Registrar', username: 'registrar', password: 'registrar12345' },
  { role: 'Principal', username: 'principal', password: 'principal12345' },
];

export function LoginPage({
  schoolName,
  onSuccess,
}: {
  schoolName: string;
  onSuccess: (session: SessionInfo) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const data = await apiFetch<SessionInfo>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password, remember }),
      });
      onSuccess(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f6f8fa] px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight text-gray-900">
            School Attendance System
          </h1>
          <p className="mt-1 text-sm text-gray-500">{schoolName}</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-lg border border-gray-200 bg-white p-6 shadow-xs"
        >
          {error && (
            <AlertBanner
              flash={{ type: 'danger', text: error }}
              onDismiss={() => setError(null)}
            />
          )}

          <div className="space-y-4">
            <div>
              <label
                htmlFor="login-username"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Username
              </label>
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                autoFocus
                required
                className={inputCls}
              />
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Password
              </label>
              <input
                id="login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                required
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="login-remember"
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-700 focus:ring-blue-600"
              />
              <label htmlFor="login-remember" className="text-sm text-gray-600">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className={`${btnPrimaryCls} w-full`}
            >
              {submitting ? 'Signing in...' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-600">
          <div className="mb-2 font-medium text-gray-800">
            Demo Accounts for Evaluation
          </div>
          <div className="divide-y divide-gray-100">
            {DEMO_ACCOUNTS.map((acc) => (
              <div
                key={acc.username}
                className="flex items-center justify-between gap-2 py-1.5"
              >
                <div>
                  <span className="font-medium text-gray-800">{acc.role}:</span>{' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-800">
                    {acc.username}
                  </code>{' '}
                  /{' '}
                  <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px] text-gray-800">
                    {acc.password}
                  </code>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setUsername(acc.username);
                    setPassword(acc.password);
                  }}
                  className="text-blue-700 hover:underline cursor-pointer shrink-0"
                >
                  Use
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
