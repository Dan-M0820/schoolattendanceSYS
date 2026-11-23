import { SchoolYear, User } from '../shared/types';

export interface SessionInfo {
  school_name: string;
  active_school_year: SchoolYear | null;
  user: User | null;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };
  if (options.body && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin',
  });
  const text = await res.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (!res.ok) {
    const msg =
      (data as { error?: string })?.error || `Request failed (${res.status})`;
    throw new ApiError(msg, res.status);
  }
  return data as T;
}

export type RouteState =
  | { page: 'dashboard' }
  | { page: 'students'; sub?: 'list' | 'new' | 'edit' | 'profile' | 'import'; id?: number }
  | { page: 'classes'; sub?: 'list' | 'new' | 'edit' | 'view' | 'enroll'; id?: number }
  | { page: 'attendance'; sub?: 'index' | 'edit'; id?: number; classId?: number; date?: string }
  | { page: 'absences'; sub?: 'list' | 'view' | 'summary'; id?: number; studentId?: number }
  | { page: 'excuses'; sub?: 'list' | 'new' | 'view'; id?: number; absenceId?: number }
  | { page: 'reports'; sub?: 'hub' | 'daily' | 'student' | 'class' | 'custom'; classId?: number; studentId?: number }
  | { page: 'users'; sub?: 'list' | 'new' | 'edit'; id?: number }
  | { page: 'settings' }
  | { page: 'backup' }
  | { page: 'change-password' };

export interface FlashMessage {
  type: 'success' | 'danger' | 'warning' | 'info';
  text: string;
}
