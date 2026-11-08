import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createDebtReminderMessage,
  createBusinessReminderMessage,
  getDueSummaryKey,
  getDaysWithoutSales,
  getReportRanges,
  getScheduledSummaryKey,
  PUSH_REMINDER_INTERVAL,
} from '../src/scheduler.js';
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

test('debt reminders include any positive balance without a minimum threshold', () => {
  const message = createDebtReminderMessage([
    { name: 'Small balance customer', balance: 500 },
    { name: 'Settled customer', balance: 0 },
  ]);
  assert.match(message, /FCFA 500/);
  assert.match(message, /Small balance customer/);
  assert.doesNotMatch(message, /threshold/i);
});

test('debt reminders are omitted when all customer balances are settled', () => {
  assert.equal(createDebtReminderMessage([{ name: 'Settled customer', balance: 0 }]), null);
});

test('report date bounds use numeric UTC milliseconds for local calendar days', () => {
  const ranges = getReportRanges(new Date('2025-02-13T12:00:00.000Z'), douala);
  assert.equal(ranges.today.from, Date.parse('2025-02-12T23:00:00.000Z'));
  assert.equal(ranges.today.end, Date.parse('2025-02-13T23:00:00.000Z'));
  assert.equal(ranges.today.to, Date.parse('2025-02-13T12:00:00.000Z'));
});

test('active business push reminders use the selected ten-minute cadence', () => {
  assert.equal(PUSH_REMINDER_INTERVAL, 10 * 60 * 1000);
});

test('days without sales are calculated using the business time zone calendar', () => {
  const now = new Date('2025-02-13T00:30:00.000Z');
  const previousLocalDaySale = Date.parse('2025-02-12T22:45:00.000Z');
  assert.equal(getDaysWithoutSales(previousLocalDaySale, now, douala), 1);
  assert.equal(getDaysWithoutSales(Date.parse('2025-02-13T00:00:00.000Z'), now, douala), 0);
  assert.equal(getDaysWithoutSales(null, now, douala), null);
});

test('active reminder digest combines debt, stock, and no-sales issues', () => {
  const message = createBusinessReminderMessage({
    customers: [{ name: 'Customer A', balance: 1200 }],
    products: [
      { name: 'Water', tracked: true, stock: 0, lowStockThreshold: 4 },
      { name: 'Juice', tracked: true, stock: 2, lowStockThreshold: 4 },
    ],
    lastSaleAt: Date.parse('2025-02-11T12:00:00.000Z'),
    daysWithoutSales: 2,
  });
  assert.match(message, /Customer debt: FCFA 1,200/);
  assert.match(message, /Out of stock: Water/);
  assert.match(message, /Low stock: Juice/);
  assert.match(message, /last sale was 2 day/);
});

test('active reminder digest respects notification preferences', () => {
  const message = createBusinessReminderMessage({
    customers: [{ name: 'Customer A', balance: 1200 }],
    products: [{ name: 'Water', tracked: true, stock: 0, lowStockThreshold: 4 }],
    lastSaleAt: null,
    notifications: {
      urgentDebt: false,
      outOfStock: false,
      lowStock: false,
      noSales: false,
    },
  });
  assert.equal(message, null);
});
