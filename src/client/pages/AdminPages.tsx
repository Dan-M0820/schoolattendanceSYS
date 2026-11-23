import React, { useCallback, useEffect, useState } from 'react';
import { apiFetch, FlashMessage, RouteState } from '../api';
import {
  MODULE_ROLES,
  ModuleKey,
  ROLES,
  SchoolYear,
  User,
} from '../../shared/types';
import { formatDateTime, formatShortDate } from '../../shared/validation';
import {
  AlertBanner,
  btnDangerCls,
  btnPrimaryCls,
  btnSecondaryCls,
  btnSmSecondaryCls,
  inputCls,
  LoadingState,
  PageHeader,
  StatusText,
} from '../components/ui';

export function UsersPage({
  route,
  onNavigate,
}: {
  route: Extract<RouteState, { page: 'users' }>;
  onNavigate: (r: RouteState) => void;
}) {
  const sub = route.sub || 'list';
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  if (sub === 'new' || sub === 'edit') {
    return (
      <UserFormView
        userId={sub === 'edit' ? route.id : undefined}
        onNavigate={onNavigate}
        onFlash={setFlash}
      />
    );
  }

  return (
    <UsersListView
      flash={flash}
      setFlash={setFlash}
      onNavigate={onNavigate}
    />
  );
}

function UsersListView({
  flash,
  setFlash,
  onNavigate,
}: {
  flash: FlashMessage | null;
  setFlash: (f: FlashMessage | null) => void;
  onNavigate: (r: RouteState) => void;
}) {
  const [users, setUsers] = useState<User[] | null>(null);

  useEffect(() => {
    apiFetch<{ users: User[] }>('/api/users')
      .then((res) => setUsers(res.users))
      .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }));
  }, [setFlash]);

  const modules = (Object.keys(MODULE_ROLES) as ModuleKey[]).sort();

  return (
    <div>
      <PageHeader
        title="Users"
        subtitle="User accounts and role-based access"
        actions={
          <button
            type="button"
            onClick={() => onNavigate({ page: 'users', sub: 'new' })}
            className={btnPrimaryCls}
          >
            Add User
          </button>
        }
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      {!users ? (
        <LoadingState label="Loading users..." />
      ) : (
        <div className="space-y-8">
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                  <th className="px-4 py-2.5">Username</th>
                  <th className="px-4 py-2.5">Full Name</th>
                  <th className="px-4 py-2.5">Role</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5">Last Login</th>
                  <th className="px-4 py-2.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((u) => (
                  <tr key={u.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-mono text-xs text-gray-700">
                      {u.username}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900">
                      {u.full_name}
                    </td>
                    <td className="px-4 py-2.5 text-gray-700">{u.role}</td>
                    <td className="px-4 py-2.5">
                      <StatusText status={u.is_active_user ? 'Active' : 'Inactive'} />
                    </td>
                    <td className="px-4 py-2.5 text-xs text-gray-500 tabular-nums">
                      {u.last_login ? formatDateTime(u.last_login) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() =>
                          onNavigate({ page: 'users', sub: 'edit', id: u.user_id })
                        }
                        className={btnSmSecondaryCls}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <h2 className="mb-3 text-base font-semibold text-gray-900">
              Role Access Matrix
            </h2>
            <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
                    <th className="px-4 py-2.5">Module</th>
                    {ROLES.map((r) => (
                      <th key={r} className="px-4 py-2.5 text-center">
                        {r}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {modules.map((m) => (
                    <tr key={m}>
                      <td className="px-4 py-2 capitalize text-gray-900">
                        {m.replace('_', ' ')}
                      </td>
                      {ROLES.map((r) => (
                        <td key={r} className="px-4 py-2 text-center">
                          {MODULE_ROLES[m].includes(r) ? (
                            <span className="font-semibold text-emerald-700">✓</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UserFormView({
  userId,
  onNavigate,
  onFlash,
}: {
  userId?: number;
  onNavigate: (r: RouteState) => void;
  onFlash: (f: FlashMessage | null) => void;
}) {
  const isEdit = Boolean(userId);
  const [form, setForm] = useState({
    username: '',
    full_name: '',
    role: '',
    is_active: true,
    password: '',
    confirm_password: '',
  });
  const [loading, setLoading] = useState(isEdit);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    apiFetch<{ users: User[] }>('/api/users')
      .then((res) => {
        const u = res.users.find((x) => x.user_id === userId);
        if (!u) throw new Error('User not found.');
        setForm({
          username: u.username,
          full_name: u.full_name,
          role: u.role,
          is_active: u.is_active_user,
          password: '',
          confirm_password: '',
        });
      })
      .catch((err) => setError((err as Error).message))
      .finally(() => setLoading(false));
  }, [userId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiFetch(isEdit ? `/api/users/${userId}` : '/api/users', {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(form),
      });
      onFlash({
        type: 'success',
        text: isEdit ? 'User updated.' : `User ${form.username} (${form.role}) created.`,
      });
      onNavigate({ page: 'users', sub: 'list' });
    } catch (err) {
      setError((err as Error).message);
    }
  };

  if (loading) return <LoadingState label="Loading user..." />;

  return (
    <div>
      <PageHeader title={isEdit ? 'Edit User' : 'Add User'} />

      <form
        onSubmit={handleSubmit}
        className="max-w-xl rounded-md border border-gray-200 bg-white p-6"
        noValidate
      >
        {error && (
          <AlertBanner
            flash={{ type: 'danger', text: error }}
            onDismiss={() => setError(null)}
          />
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="uf-user" className="mb-1 block text-sm font-medium text-gray-700">
              Username <span className="text-red-600">*</span>
            </label>
            <input
              id="uf-user"
              type="text"
              value={form.username}
              disabled={isEdit}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={`${inputCls} disabled:bg-gray-100`}
            />
          </div>
          <div>
            <label htmlFor="uf-name" className="mb-1 block text-sm font-medium text-gray-700">
              Full Name <span className="text-red-600">*</span>
            </label>
            <input
              id="uf-name"
              type="text"
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="uf-role" className="mb-1 block text-sm font-medium text-gray-700">
              Role <span className="text-red-600">*</span>
            </label>
            <select
              id="uf-role"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className={inputCls}
            >
              <option value="">-- Select --</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          {isEdit && (
            <div>
              <label htmlFor="uf-status" className="mb-1 block text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="uf-status"
                value={form.is_active ? '1' : '0'}
                onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}
                className={inputCls}
              >
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          )}
          <div>
            <label htmlFor="uf-pw" className="mb-1 block text-sm font-medium text-gray-700">
              {isEdit ? 'New password (leave blank to keep)' : 'Password'}{' '}
              {!isEdit && <span className="text-red-600">*</span>}
            </label>
            <input
              id="uf-pw"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              autoComplete="new-password"
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">
              At least 8 characters with letters and numbers.
            </p>
          </div>
          <div>
            <label htmlFor="uf-pw2" className="mb-1 block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              id="uf-pw2"
              type="password"
              value={form.confirm_password}
              onChange={(e) => setForm({ ...form, confirm_password: e.target.value })}
              autoComplete="new-password"
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" className={btnPrimaryCls}>
            Save
          </button>
          <button
            type="button"
            onClick={() => onNavigate({ page: 'users', sub: 'list' })}
            className={btnSecondaryCls}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

export function SettingsPage({
  onSchoolYearChange,
}: {
  onSchoolYearChange: () => void;
}) {
  const [settings, setSettings] = useState({
    alert_unexcused_threshold: '5',
    alert_rate_threshold: '85',
    late_counts_as_present: true,
  });
  const [years, setYears] = useState<SchoolYear[]>([]);
  const [newStart, setNewStart] = useState('');
  const [newEnd, setNewEnd] = useState('');
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch<{ settings: Record<string, string>; years: SchoolYear[] }>('/api/settings')
      .then((res) => {
        setSettings({
          alert_unexcused_threshold: res.settings.alert_unexcused_threshold || '5',
          alert_rate_threshold: res.settings.alert_rate_threshold || '85',
          late_counts_as_present: res.settings.late_counts_as_present === '1',
        });
        setYears(res.years);
      })
      .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/settings', {
        method: 'POST',
        body: JSON.stringify(settings),
      });
      setFlash({ type: 'success', text: res.message });
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  const handleAddYear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ school_year: SchoolYear }>(
        '/api/settings/school-years',
        {
          method: 'POST',
          body: JSON.stringify({ start_date: newStart, end_date: newEnd }),
        },
      );
      setFlash({ type: 'success', text: `School year ${res.school_year.name} added.` });
      setNewStart('');
      setNewEnd('');
      load();
      onSchoolYearChange();
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  const handleActivate = async (sy: SchoolYear) => {
    try {
      await apiFetch(`/api/settings/school-years/${sy.school_year_id}/activate`, {
        method: 'POST',
      });
      setFlash({ type: 'success', text: `School year ${sy.name} is now active.` });
      load();
      onSchoolYearChange();
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  if (loading) return <LoadingState label="Loading settings..." />;

  return (
    <div>
      <PageHeader
        title="Settings"
        subtitle="Attendance rules and school years"
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <form
          onSubmit={handleSaveSettings}
          className="rounded-md border border-gray-200 bg-white p-5 h-fit"
        >
          <h2 className="mb-4 text-sm font-semibold text-gray-900">
            Attendance Settings
          </h2>
          <div className="space-y-4">
            <div>
              <label htmlFor="st-thresh" className="mb-1 block text-sm font-medium text-gray-700">
                Alert after this many unexcused absences
              </label>
              <input
                id="st-thresh"
                type="number"
                min={1}
                max={100}
                value={settings.alert_unexcused_threshold}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    alert_unexcused_threshold: e.target.value,
                  })
                }
                className={inputCls}
              />
              <p className="mt-1 text-xs text-gray-500">
                Students reaching or exceeding this count appear in Dashboard alerts.
              </p>
            </div>

            <div>
              <label htmlFor="st-rate" className="mb-1 block text-sm font-medium text-gray-700">
                Low attendance rate warning (%)
              </label>
              <input
                id="st-rate"
                type="number"
                min={1}
                max={100}
                value={settings.alert_rate_threshold}
                onChange={(e) =>
                  setSettings({ ...settings, alert_rate_threshold: e.target.value })
                }
                className={inputCls}
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="st-late"
                type="checkbox"
                checked={settings.late_counts_as_present}
                onChange={(e) =>
                  setSettings({ ...settings, late_counts_as_present: e.target.checked })
                }
                className="h-4 w-4 rounded border-gray-300 text-blue-700"
              />
              <label htmlFor="st-late" className="text-sm text-gray-700">
                Count late days as present days in the attendance rate
              </label>
            </div>
          </div>

          <div className="mt-5 border-t border-gray-200 pt-4">
            <button type="submit" className={btnPrimaryCls}>
              Save Settings
            </button>
          </div>
        </form>

        <div className="rounded-md border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-900">School Years</h2>
          <table className="mb-5 w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-xs font-medium text-gray-500">
                <th className="py-2 pr-3">School Year</th>
                <th className="py-2 px-3">Start</th>
                <th className="py-2 px-3">End</th>
                <th className="py-2 pl-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {years.map((y) => (
                <tr key={y.school_year_id}>
                  <td className="py-2 pr-3 font-medium text-gray-900">{y.name}</td>
                  <td className="py-2 px-3 tabular-nums text-gray-600">
                    {formatShortDate(y.start_date)}
                  </td>
                  <td className="py-2 px-3 tabular-nums text-gray-600">
                    {formatShortDate(y.end_date)}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {y.is_active ? (
                      <StatusText status="Active" />
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleActivate(y)}
                        className={btnSmSecondaryCls}
                      >
                        Set Active
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <form onSubmit={handleAddYear} className="border-t border-gray-200 pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="sy-start" className="mb-1 block text-xs font-medium text-gray-700">
                  Start Date
                </label>
                <input
                  id="sy-start"
                  type="date"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
              <div>
                <label htmlFor="sy-end" className="mb-1 block text-xs font-medium text-gray-700">
                  End Date
                </label>
                <input
                  id="sy-end"
                  type="date"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  required
                  className={inputCls}
                />
              </div>
            </div>
            <div className="mt-3">
              <button type="submit" className={btnSecondaryCls}>
                Add School Year
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export function BackupPage() {
  const [backups, setBackups] = useState<
    Array<{ name: string; created_at: string; size_kb: number }>
  >([]);
  const [selectedName, setSelectedName] = useState('');
  const [uploadedPayload, setUploadedPayload] = useState<unknown>(null);
  const [confirmText, setConfirmText] = useState('');
  const [flash, setFlash] = useState<FlashMessage | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    apiFetch<{ backups: typeof backups }>('/api/backups')
      .then((res) => setBackups(res.backups))
      .catch((err) => setFlash({ type: 'danger', text: (err as Error).message }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async () => {
    try {
      const res = await apiFetch<{ message: string }>('/api/backups/create', {
        method: 'POST',
      });
      setFlash({ type: 'success', text: res.message });
      load();
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  const handleVerify = async (name: string) => {
    try {
      const res = await apiFetch<{ message: string }>(`/api/backups/${name}/verify`, {
        method: 'POST',
      });
      setFlash({ type: 'success', text: res.message });
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      setUploadedPayload(null);
      return;
    }
    try {
      const text = await file.text();
      setUploadedPayload(JSON.parse(text));
    } catch {
      setFlash({ type: 'danger', text: 'Uploaded file is not valid JSON.' });
      setUploadedPayload(null);
    }
  };

  const handleRestore = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await apiFetch<{ message: string }>('/api/backups/restore', {
        method: 'POST',
        body: JSON.stringify({
          name: selectedName || undefined,
          payload: uploadedPayload || undefined,
          confirm: confirmText,
        }),
      });
      setFlash({ type: 'success', text: res.message });
      setConfirmText('');
      setUploadedPayload(null);
      load();
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  if (loading) return <LoadingState label="Loading backups..." />;

  return (
    <div>
      <PageHeader
        title="Backup & Recovery"
        subtitle="Create, verify, download, and restore database backups"
      />

      {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

      <div className="mb-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-md border border-gray-200 bg-white p-5 h-fit">
          <h2 className="text-sm font-semibold text-gray-900">Create Backup</h2>
          <p className="mt-1 mb-4 text-xs text-gray-500">
            Saves every table to a portable JSON file with a SHA-256 checksum, then
            verifies its integrity.
          </p>
          <button type="button" onClick={handleCreate} className={btnPrimaryCls}>
            Create Backup Now
          </button>
        </div>

        <form
          onSubmit={handleRestore}
          className="rounded-md border border-gray-200 bg-white p-5"
        >
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Restore Database</h2>
          <AlertBanner
            flash={{
              type: 'warning',
              text: 'Restoring replaces all current data. A safety backup of the current data is created first.',
            }}
          />
          <div className="space-y-3">
            <div>
              <label htmlFor="bk-sel" className="mb-1 block text-xs font-medium text-gray-700">
                Backup on server
              </label>
              <select
                id="bk-sel"
                value={selectedName}
                onChange={(e) => setSelectedName(e.target.value)}
                className={inputCls}
              >
                <option value="">-- Select --</option>
                {backups.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bk-up" className="mb-1 block text-xs font-medium text-gray-700">
                Or upload a backup file
              </label>
              <input
                id="bk-up"
                type="file"
                accept=".json"
                onChange={handleUpload}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="bk-conf" className="mb-1 block text-xs font-medium text-gray-700">
                Type RESTORE to confirm
              </label>
              <input
                id="bk-conf"
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                className={inputCls}
              />
            </div>
          </div>
          <div className="mt-4">
            <button type="submit" className={btnDangerCls}>
              Restore
            </button>
          </div>
        </form>
      </div>

      <h2 className="mb-3 text-base font-semibold text-gray-900">Available Backups</h2>
      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-600">
              <th className="px-4 py-2.5">File</th>
              <th className="px-4 py-2.5">Created</th>
              <th className="px-4 py-2.5 text-right">Size</th>
              <th className="px-4 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {backups.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  No backups yet.
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.name}>
                  <td className="px-4 py-2.5 font-mono text-xs text-gray-800">
                    {b.name}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-600 tabular-nums">
                    {formatDateTime(b.created_at)}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs text-gray-600 tabular-nums">
                    {b.size_kb} KB
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleVerify(b.name)}
                        className={btnSmSecondaryCls}
                      >
                        Verify
                      </button>
                      <a
                        href={`/api/backups/${encodeURIComponent(b.name)}/download`}
                        className={btnSmSecondaryCls}
                      >
                        Download
                      </a>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ChangePasswordPage({
  onDone,
}: {
  onDone: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [flash, setFlash] = useState<FlashMessage | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFlash(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });
      setFlash({ type: 'success', text: res.message });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setFlash({ type: 'danger', text: (err as Error).message });
    }
  };

  return (
    <div>
      <PageHeader title="Change Password" />

      <form
        onSubmit={handleSubmit}
        className="max-w-md rounded-md border border-gray-200 bg-white p-6"
      >
        {flash && <AlertBanner flash={flash} onDismiss={() => setFlash(null)} />}

        <div className="space-y-4">
          <div>
            <label htmlFor="cp-cur" className="mb-1 block text-sm font-medium text-gray-700">
              Current Password <span className="text-red-600">*</span>
            </label>
            <input
              id="cp-cur"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>
          <div>
            <label htmlFor="cp-new" className="mb-1 block text-sm font-medium text-gray-700">
              New Password <span className="text-red-600">*</span>
            </label>
            <input
              id="cp-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className={inputCls}
            />
            <p className="mt-1 text-xs text-gray-500">
              At least 8 characters with letters and numbers.
            </p>
          </div>
          <div>
            <label htmlFor="cp-conf" className="mb-1 block text-sm font-medium text-gray-700">
              Confirm New Password <span className="text-red-600">*</span>
            </label>
            <input
              id="cp-conf"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2 border-t border-gray-200 pt-4">
          <button type="submit" className={btnPrimaryCls}>
            Save
          </button>
          <button type="button" onClick={onDone} className={btnSecondaryCls}>
            Back to Dashboard
          </button>
        </div>
      </form>
    </div>
  );
}
