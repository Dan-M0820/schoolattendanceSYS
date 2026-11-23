import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateStudentNumber,
  validateContactNumber,
  validatePassword,
  validateSchoolDate,
  ValidationError,
} from './validation';
import { summarizeCounts, countRecords } from './stats';
import { parseCsv, toCsv } from './csv';
import { canAccess } from './types';

test('student number validates YYYY-NNNN format', () => {
  assert.equal(validateStudentNumber('2026-0001'), '2026-0001');
  assert.throws(() => validateStudentNumber('2026001'), ValidationError);
  assert.throws(() => validateStudentNumber(''), ValidationError);
});

test('contact number validates PH 09XXXXXXXXX mobile numbers', () => {
  assert.equal(validateContactNumber('0917-123-4567'), '09171234567');
  assert.equal(validateContactNumber('  '), null);
  assert.throws(() => validateContactNumber('12345678901'), ValidationError);
});

test('password requires 8+ chars with letters and numbers', () => {
  assert.equal(validatePassword('admin12345'), 'admin12345');
  assert.throws(() => validatePassword('short1'), ValidationError);
  assert.throws(() => validatePassword('onlyletters'), ValidationError);
  assert.throws(() => validatePassword('123456789'), ValidationError);
});

test('schoolDate rejects weekends, future dates, and out-of-range school years', () => {
  const sy = { name: '2026-2027', start_date: '2026-06-01', end_date: '2027-04-30' };
  // 2026-11-20 is Friday
  assert.equal(validateSchoolDate('2026-11-20', sy, '2026-11-22'), '2026-11-20');
  // 2026-11-21 is Saturday
  assert.throws(() => validateSchoolDate('2026-11-21', sy, '2026-11-22'), /weekend/);
  // Future date
  assert.throws(() => validateSchoolDate('2026-11-23', sy, '2026-11-22'), /future/);
  // Outside school year
  assert.throws(() => validateSchoolDate('2026-05-15', sy, '2026-11-22'), /outside school year/);
});

test('summarizeCounts calculates attendance rate with and without late-as-present', () => {
  const counts = countRecords([
    { status: 'P' },
    { status: 'P' },
    { status: 'L' },
    { status: 'A' },
  ]);
  const withLate = summarizeCounts(counts, true);
  assert.equal(withLate.total_days, 4);
  assert.equal(withLate.rate, 75);
  assert.equal(withLate.absent, 1);
  assert.equal(withLate.unexcused, 1);

  const withoutLate = summarizeCounts(counts, false);
  assert.equal(withoutLate.rate, 50);
});

test('CSV parser and serializer handle quotes and BOM cleanly', () => {
  const csv = toCsv(
    ['student_number', 'last_name'],
    [['2026-0001', 'Dela Cruz, Jr.']],
  );
  const parsed = parseCsv(`\uFEFF${csv}`);
  assert.deepEqual(parsed.headers, ['student_number', 'last_name']);
  assert.equal(parsed.rows[0].last_name, 'Dela Cruz, Jr.');
});

test('RBAC permissions match expected role matrix', () => {
  assert.equal(canAccess('users', 'Administrator'), true);
  assert.equal(canAccess('users', 'Teacher'), false);
  assert.equal(canAccess('attendance', 'Adviser'), true);
  assert.equal(canAccess('attendance', 'Registrar'), false);
  assert.equal(canAccess('reports', 'Principal'), true);
  assert.equal(canAccess('students', 'Principal'), false);
});
