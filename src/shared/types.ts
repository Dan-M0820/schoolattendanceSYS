export const ROLES = [
  'Administrator',
  'Teacher',
  'Adviser',
  'Registrar',
  'Principal',
] as const;

export type UserRole = (typeof ROLES)[number];

export const STATUS_LABELS = {
  P: 'Present',
  A: 'Absent',
  L: 'Late',
  E: 'Excused',
} as const;

export type AttendanceStatusCode = keyof typeof STATUS_LABELS;
export const STATUS_CODES: AttendanceStatusCode[] = ['P', 'A', 'L', 'E'];

export const PERIODS = ['Whole Day', 'Morning', 'Afternoon'] as const;
export type AttendancePeriod = (typeof PERIODS)[number];

export const EXCUSE_STATUSES = ['Pending', 'Approved', 'Rejected'] as const;
export type ExcuseStatus = (typeof EXCUSE_STATUSES)[number];

export const EXCUSE_REASONS = [
  'Medical Appointment',
  'Illness',
  'Family Emergency',
  'Bereavement',
  'School Activity',
  'Weather/Calamity',
  'Other',
] as const;

export const GRADE_LEVELS = Array.from({ length: 12 }, (_, i) => `Grade ${i + 1}`);
export const GENDERS = ['Male', 'Female'] as const;

export type ModuleKey =
  | 'dashboard'
  | 'students'
  | 'classes'
  | 'enrollments'
  | 'attendance'
  | 'absences'
  | 'excuses'
  | 'excuse_review'
  | 'reports'
  | 'users'
  | 'settings'
  | 'backup';

export const MODULE_ROLES: Record<ModuleKey, UserRole[]> = {
  dashboard: ['Administrator', 'Teacher', 'Adviser', 'Registrar', 'Principal'],
  students: ['Administrator', 'Teacher', 'Registrar'],
  classes: ['Administrator', 'Teacher', 'Registrar'],
  enrollments: ['Administrator', 'Teacher', 'Registrar'],
  attendance: ['Administrator', 'Teacher', 'Adviser'],
  absences: ['Administrator', 'Teacher', 'Adviser'],
  excuses: ['Administrator', 'Teacher', 'Adviser'],
  excuse_review: ['Administrator', 'Teacher', 'Adviser'],
  reports: ['Administrator', 'Teacher', 'Adviser', 'Principal'],
  users: ['Administrator'],
  settings: ['Administrator'],
  backup: ['Administrator'],
};

export interface MenuItem {
  module: ModuleKey;
  label: string;
  path: string;
}

export const MENU_ITEMS: MenuItem[] = [
  { module: 'dashboard', label: 'Dashboard', path: 'dashboard' },
  { module: 'students', label: 'Students', path: 'students' },
  { module: 'classes', label: 'Classes', path: 'classes' },
  { module: 'attendance', label: 'Attendance', path: 'attendance' },
  { module: 'absences', label: 'Absences', path: 'absences' },
  { module: 'excuses', label: 'Excuses', path: 'excuses' },
  { module: 'reports', label: 'Reports', path: 'reports' },
  { module: 'users', label: 'Users', path: 'users' },
];

export const ADMIN_MENU_ITEMS: MenuItem[] = [
  { module: 'settings', label: 'Settings', path: 'settings' },
  { module: 'backup', label: 'Backup & Recovery', path: 'backup' },
];

export function canAccess(module: ModuleKey, role?: UserRole | null): boolean {
  if (!role) return false;
  return MODULE_ROLES[module]?.includes(role) ?? false;
}

export interface SchoolYear {
  school_year_id: number;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string; // YYYY-MM-DD
  is_active: boolean;
}

export interface User {
  user_id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active_user: boolean;
  last_login: string | null;
  created_at: string;
}

export interface Student {
  student_id: number;
  student_number: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  gender: 'Male' | 'Female';
  birth_date: string; // YYYY-MM-DD
  contact_number: string | null;
  status: 'Active' | 'Inactive';
  created_at: string;
}

export interface ClassSection {
  class_id: number;
  class_code: string;
  class_name: string;
  grade_level: string;
  section: string;
  adviser_id: number | null;
  school_year_id: number;
}

export interface Enrollment {
  enrollment_id: number;
  student_id: number;
  class_id: number;
  date_enrolled: string; // YYYY-MM-DD
  status: 'Enrolled' | 'Dropped' | 'Transferred';
}

export interface AttendanceRecord {
  attendance_id: number;
  student_id: number;
  class_id: number;
  attendance_date: string; // YYYY-MM-DD
  subject: string | null;
  period: AttendancePeriod;
  status: AttendanceStatusCode;
  remarks: string | null;
  recorded_by: number | null;
  recorded_at: string;
  updated_at: string | null;
}

export interface AbsenceRecord {
  absence_id: number;
  attendance_id: number;
  student_id: number;
  class_id: number;
  absence_date: string; // YYYY-MM-DD
  status: 'Unexcused' | 'Excused';
  created_at: string;
}

export interface ExcuseRecord {
  excuse_id: number;
  absence_id: number;
  student_id: number;
  reason: string;
  remarks: string | null;
  attachment: string | null;
  attachment_data: string | null; // base64 data URL for browser preview/download
  status: ExcuseStatus;
  submitted_by: number | null;
  submitted_at: string;
  reviewed_by: number | null;
  reviewed_at: string | null;
  review_remarks: string | null;
}

export interface AttendanceSetting {
  setting_id: number;
  key: 'alert_unexcused_threshold' | 'alert_rate_threshold' | 'late_counts_as_present';
  value: string;
  description: string;
}

export interface AttendanceSummary {
  total_days: number;
  present: number;
  late: number;
  absent: number;
  excused: number;
  unexcused: number;
  rate: number;
}
