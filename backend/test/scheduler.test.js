import assert from 'node:assert/strict';
import test from 'node:test';
import { getDueSummaryKey, getReportRanges, getScheduledSummaryKey } from '../src/scheduler.js';
import { URGENT_REMINDER_INTERVAL } from '../src/email.js';

const douala = 'Africa/Douala';

test('scheduled summary keys use the configured local time', () => {
  assert.equal(
    getScheduledSummaryKey(new Date('2025-02-13T06:00:00.000Z'), douala),
    '2025-02-13 07:00'
  );
  assert.equal(getScheduledSummaryKey(new Date('2025-02-13T06:01:00.000Z'), douala), null);
});

test('scheduled summaries have a short retry window after their slot', () => {
  assert.equal(
    getDueSummaryKey(new Date('2025-02-13T06:04:00.000Z'), douala),
    '2025-02-13 07:00'
  );
  assert.equal(getDueSummaryKey(new Date('2025-02-13T06:06:00.000Z'), douala), null);
});

test('scheduled summaries run at the top of every local hour', () => {
  for (let hour = 0; hour < 24; hour += 1) {
    const utcDate = new Date(Date.UTC(2025, 1, 13, hour - 1, 0));
    const expectedHour = String(hour).padStart(2, '0');
    assert.equal(
      getScheduledSummaryKey(utcDate, douala),
      `2025-02-13 ${expectedHour}:00`
    );
    assert.equal(
      getDueSummaryKey(new Date(utcDate.getTime() + 4 * 60_000), douala),
      `2025-02-13 ${expectedHour}:00`
    );
  }
});

test('urgent reminders repeat hourly while the urgent condition persists', () => {
  assert.equal(URGENT_REMINDER_INTERVAL, 60 * 60 * 1000);
});

test('report date bounds use numeric UTC milliseconds for local calendar days', () => {
  const ranges = getReportRanges(new Date('2025-02-13T12:00:00.000Z'), douala);
  assert.equal(ranges.today.from, Date.parse('2025-02-12T23:00:00.000Z'));
  assert.equal(ranges.today.end, Date.parse('2025-02-13T23:00:00.000Z'));
  assert.equal(ranges.today.to, Date.parse('2025-02-13T12:00:00.000Z'));
});
