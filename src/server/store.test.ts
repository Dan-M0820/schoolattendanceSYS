import test from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceStore, mostRecentSchoolDay } from './store';

test('seeded store loads 4 classes, 40 students, and 5 demo users', () => {
  const s = new AttendanceStore();
  assert.equal(s.db.classes.length, 4);
  assert.equal(s.db.students.length, 40);
  assert.equal(s.db.users.length, 5);
  assert.ok(s.authenticate('admin', 'admin12345'));
  assert.equal(s.authenticate('admin', 'wrong'), null);
});

test('recording Absent creates Unexcused absence, and approving Excuse marks it Excused', () => {
  const s = new AttendanceStore();
  const rizal = s.db.classes.find((c) => c.section === 'Rizal')!;
  const roster = s.classRoster(rizal.class_id);
  const targetDay = mostRecentSchoolDay();

  // Confirm Grade 8 - Rizal has no attendance on mostRecentSchoolDay
  const existing = s.db.attendance.filter(
    (a) => a.class_id === rizal.class_id && a.attendance_date === targetDay,
  );
  assert.equal(existing.length, 0);

  const entries = roster.map((st, idx) => ({
    student_id: st.student_id,
    status: (idx === 0 ? 'A' : 'P') as 'A' | 'P',
    remarks: idx === 0 ? 'Sick' : '',
  }));

  const created = s.recordClassAttendance(rizal.class_id, targetDay, entries, 1);
  assert.equal(created.length, roster.length);

  const absentAtt = created[0];
  const absence = s.db.absence_records.find(
    (ab) => ab.attendance_id === absentAtt.attendance_id,
  );
  assert.ok(absence);
  assert.equal(absence.status, 'Unexcused');

  const excuse = s.submitExcuse(
    absence.absence_id,
    'Illness',
    'Fever',
    null,
    null,
    2,
  );
  assert.equal(excuse.status, 'Pending');

  s.reviewExcuse(excuse.excuse_id, 'Approved', 'Medical note verified', 3);
  assert.equal(absence.status, 'Excused');
  assert.equal(absentAtt.status, 'E');
});

test('backup creation, verification, and restore preserve data integrity', () => {
  const s = new AttendanceStore();
  const backup = s.createBackup();
  const verified = s.verifyBackupPayload(backup.payload);
  assert.equal(verified.meta.tables.students, 40);

  // Mutate state and restore
  s.createOrUpdateStudent({
    student_number: '2026-9999',
    first_name: 'Temp',
    last_name: 'User',
    gender: 'Male',
    birth_date: '2012-01-01',
  });
  assert.equal(s.db.students.length, 41);

  s.restoreFromPayload(backup.payload);
  assert.equal(s.db.students.length, 40);
});
