import { useCallback, useEffect, useState } from 'react';
import { apiFetch, RouteState, SessionInfo } from './client/api';
import { canAccess, ModuleKey } from './shared/types';
import { AppShell } from './client/components/AppShell';
import { LoadingState } from './client/components/ui';
import { LoginPage } from './client/pages/LoginPage';
import { DashboardPage } from './client/pages/DashboardPage';
import { StudentsPage } from './client/pages/StudentsPage';
import { ClassesPage } from './client/pages/ClassesPage';
import { AttendancePage } from './client/pages/AttendancePage';
import { AbsencesPage } from './client/pages/AbsencesPage';
import { ExcusesPage } from './client/pages/ExcusesPage';
import { ReportsPage } from './client/pages/ReportsPage';
import {
  BackupPage,
  ChangePasswordPage,
  SettingsPage,
  UsersPage,
} from './client/pages/AdminPages';

function getBreadcrumb(route: RouteState): string {
  switch (route.page) {
    case 'dashboard':
      return 'Dashboard';
    case 'students':
      if (route.sub === 'new') return 'Students / Add Student';
      if (route.sub === 'edit') return 'Students / Edit Student';
      if (route.sub === 'profile') return 'Students / Student Profile';
      if (route.sub === 'import') return 'Students / Import CSV';
      return 'Students';
    case 'classes':
      if (route.sub === 'new') return 'Classes / Add Class';
      if (route.sub === 'edit') return 'Classes / Edit Class';
      if (route.sub === 'view') return 'Classes / Roster';
      if (route.sub === 'enroll') return 'Classes / Enroll Students';
      return 'Classes';
    case 'attendance':
      return route.sub === 'edit' ? 'Attendance / Edit Record' : 'Daily Attendance';
    case 'absences':
      if (route.sub === 'view') return 'Absences / Details';
      if (route.sub === 'summary') return 'Absences / Summary';
      return 'Absences';
    case 'excuses':
      if (route.sub === 'new') return 'Excuses / New Request';
      if (route.sub === 'view') return 'Excuses / Details';
      return 'Excuses';
    case 'reports':
      if (route.sub === 'daily') return 'Reports / Daily';
      if (route.sub === 'student') return 'Reports / Student';
      if (route.sub === 'class') return 'Reports / Class';
      if (route.sub === 'custom') return 'Reports / Custom';
      return 'Reports';
    case 'users':
      if (route.sub === 'new') return 'Users / Add User';
      if (route.sub === 'edit') return 'Users / Edit User';
      return 'Users';
    case 'settings':
      return 'Administration / Settings';
    case 'backup':
      return 'Administration / Backup & Recovery';
    case 'change-password':
      return 'Account / Change Password';
  }
}

export default function App() {
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [route, setRoute] = useState<RouteState>({ page: 'dashboard' });

  const refreshSession = useCallback(() => {
    return apiFetch<SessionInfo>('/api/auth/me')
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refreshSession();
  }, [refreshSession]);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    setSession((prev) => (prev ? { ...prev, user: null } : null));
    setRoute({ page: 'dashboard' });
  };

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f8fa] p-6">
        <div className="w-full max-w-sm">
          <LoadingState label="Starting School Attendance System..." />
        </div>
      </div>
    );
  }

  if (!session.user) {
    return (
      <LoginPage
        schoolName={session.school_name}
        onSuccess={(s) => {
          setSession(s);
          setRoute({ page: 'dashboard' });
        }}
      />
    );
  }

  const user = session.user;

  const navigate = (next: RouteState) => {
    const modMap: Record<RouteState['page'], ModuleKey | null> = {
      dashboard: 'dashboard',
      students: 'students',
      classes: 'classes',
      attendance: 'attendance',
      absences: 'absences',
      excuses: 'excuses',
      reports: 'reports',
      users: 'users',
      settings: 'settings',
      backup: 'backup',
      'change-password': null,
    };
    const mod = modMap[next.page];
    if (mod && !canAccess(mod, user.role)) return;
    setRoute(next);
    window.scrollTo(0, 0);
  };

  return (
    <AppShell
      user={user}
      schoolName={session.school_name}
      activeSchoolYear={session.active_school_year}
      route={route}
      breadcrumb={getBreadcrumb(route)}
      onNavigate={navigate}
      onLogout={handleLogout}
    >
      {route.page === 'dashboard' && (
        <DashboardPage role={user.role} onNavigate={navigate} />
      )}
      {route.page === 'students' && (
        <StudentsPage route={route} role={user.role} onNavigate={navigate} />
      )}
      {route.page === 'classes' && (
        <ClassesPage
          route={route}
          role={user.role}
          userId={user.user_id}
          onNavigate={navigate}
        />
      )}
      {route.page === 'attendance' && (
        <AttendancePage route={route} onNavigate={navigate} />
      )}
      {route.page === 'absences' && (
        <AbsencesPage route={route} onNavigate={navigate} />
      )}
      {route.page === 'excuses' && (
        <ExcusesPage route={route} onNavigate={navigate} />
      )}
      {route.page === 'reports' && (
        <ReportsPage
          route={route}
          schoolName={session.school_name}
          onNavigate={navigate}
        />
      )}
      {route.page === 'users' && (
        <UsersPage route={route} onNavigate={navigate} />
      )}
      {route.page === 'settings' && (
        <SettingsPage onSchoolYearChange={refreshSession} />
      )}
      {route.page === 'backup' && <BackupPage />}
      {route.page === 'change-password' && (
        <ChangePasswordPage onDone={() => navigate({ page: 'dashboard' })} />
      )}
    </AppShell>
  );
}
