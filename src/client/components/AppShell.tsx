import React, { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  BookOpen,
  ClipboardCheck,
  CalendarX,
  FileText,
  BarChart3,
  Shield,
  Settings,
  DatabaseBackup,
  Menu,
  X,
} from 'lucide-react';
import {
  ADMIN_MENU_ITEMS,
  canAccess,
  MENU_ITEMS,
  ModuleKey,
  SchoolYear,
  User,
} from '../../shared/types';
import { RouteState } from '../api';

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  students: Users,
  classes: BookOpen,
  attendance: ClipboardCheck,
  absences: CalendarX,
  excuses: FileText,
  reports: BarChart3,
  users: Shield,
  settings: Settings,
  backup: DatabaseBackup,
};

export function AppShell({
  user,
  schoolName,
  activeSchoolYear,
  route,
  breadcrumb,
  onNavigate,
  onLogout,
  children,
}: {
  user: User;
  schoolName: string;
  activeSchoolYear: SchoolYear | null;
  route: RouteState;
  breadcrumb: string;
  onNavigate: (r: RouteState) => void;
  onLogout: () => void;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = MENU_ITEMS.filter((item) => canAccess(item.module, user.role));
  const adminItems = ADMIN_MENU_ITEMS.filter((item) =>
    canAccess(item.module, user.role),
  );

  const navigate = (mod: ModuleKey) => {
    setMobileOpen(false);
    if (mod === 'dashboard') onNavigate({ page: 'dashboard' });
    else if (mod === 'students') onNavigate({ page: 'students', sub: 'list' });
    else if (mod === 'classes') onNavigate({ page: 'classes', sub: 'list' });
    else if (mod === 'attendance') onNavigate({ page: 'attendance', sub: 'index' });
    else if (mod === 'absences') onNavigate({ page: 'absences', sub: 'list' });
    else if (mod === 'excuses') onNavigate({ page: 'excuses', sub: 'list' });
    else if (mod === 'reports') onNavigate({ page: 'reports', sub: 'hub' });
    else if (mod === 'users') onNavigate({ page: 'users', sub: 'list' });
    else if (mod === 'settings') onNavigate({ page: 'settings' });
    else if (mod === 'backup') onNavigate({ page: 'backup' });
  };

  const sidebarContent = (
    <div className="flex h-full flex-col bg-white">
      <div className="border-b border-gray-200 px-5 py-4">
        <div className="text-sm font-semibold text-gray-900">
          School Attendance System
        </div>
        <div className="mt-0.5 text-xs text-gray-500 truncate">{schoolName}</div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4" aria-label="Main">
        {navItems.map((item) => {
          const Icon = ICONS[item.module];
          const active = route.page === item.path;
          return (
            <button
              key={item.module}
              type="button"
              onClick={() => navigate(item.module)}
              aria-current={active ? 'page' : undefined}
              className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer ${
                active
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }`}
            >
              {Icon && (
                <Icon
                  className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-gray-400'}`}
                />
              )}
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}

        {adminItems.length > 0 && (
          <div className="pt-4">
            <div className="px-3 pb-1.5 text-xs font-medium text-gray-400">
              Administration
            </div>
            <div className="space-y-1">
              {adminItems.map((item) => {
                const Icon = ICONS[item.module];
                const active = route.page === item.path;
                return (
                  <button
                    key={item.module}
                    type="button"
                    onClick={() => navigate(item.module)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors cursor-pointer ${
                      active
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                  >
                    {Icon && (
                      <Icon
                        className={`h-4 w-4 shrink-0 ${active ? 'text-blue-700' : 'text-gray-400'}`}
                      />
                    )}
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </nav>

      <div className="border-t border-gray-200 px-4 py-3.5 text-xs">
        <div className="font-medium text-gray-900 truncate">{user.full_name}</div>
        <div className="text-gray-500">{user.role}</div>
        <div className="mt-2.5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onNavigate({ page: 'change-password' });
            }}
            className="text-blue-700 hover:underline cursor-pointer"
          >
            Change password
          </button>
          <span className="text-gray-300" aria-hidden="true">
            ·
          </span>
          <button
            type="button"
            onClick={onLogout}
            className="text-gray-600 hover:text-gray-900 hover:underline cursor-pointer"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#f6f8fa] text-gray-900">
      {/* Desktop sidebar */}
      <aside className="hidden w-60 shrink-0 border-r border-gray-200 bg-white lg:block no-print">
        <div className="sticky top-0 h-screen">{sidebarContent}</div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex lg:hidden no-print">
          <div
            className="fixed inset-0 bg-gray-900/40"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative z-50 w-64 max-w-[80vw] border-r border-gray-200 bg-white">
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="absolute right-3 top-3 rounded p-1 text-gray-500 hover:bg-gray-100"
              aria-label="Close navigation menu"
            >
              <X className="h-4 w-4" />
            </button>
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main viewport */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between gap-4 border-b border-gray-200 bg-white px-4 sm:px-6 no-print">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="rounded-md p-1.5 text-gray-600 hover:bg-gray-100 lg:hidden"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="truncate text-sm font-medium text-gray-600">
              {breadcrumb}
            </div>
          </div>
          <div className="shrink-0 text-xs text-gray-500">
            {activeSchoolYear ? `School Year ${activeSchoolYear.name}` : 'No active school year'}
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1200px] flex-1 px-4 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
