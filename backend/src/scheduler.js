import 'dotenv/config';
import { Customer, Expense, Payment, Product, Sale, Setting } from './models.js';
import { notifyAdmin, notifyUrgentAdmin } from './email.js';

export const NOTIFICATION_TIMES = ['07:00', '09:00', '12:00', '19:00'];
export const NOTIFICATION_TIME_ZONE = process.env.NOTIFICATION_TIME_ZONE || 'Africa/Douala';

const URGENT_DEBT_THRESHOLD = 100_000;
const SCHEDULER_INTERVAL = 30 * 1000;

const formatterCache = new Map();
let schedulerInterval = null;
let checkInProgress = false;
let lastDailySummaryKey = '';
let lastDailySummaryAttemptAt = 0;
let lastUrgentCheckAt = 0;

function getFormatter(timeZone) {
  if (!formatterCache.has(timeZone)) {
    formatterCache.set(timeZone, new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }));
  }
  return formatterCache.get(timeZone);
}

export function getZonedDateParts(date, timeZone = NOTIFICATION_TIME_ZONE) {
  const parts = Object.fromEntries(
    getFormatter(timeZone).formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map(({ type, value }) => [type, value])
  );
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    weekday: parts.weekday,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const targetUtc = Date.UTC(year, month - 1, day, hour, minute);
  let timestamp = targetUtc;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const local = getZonedDateParts(new Date(timestamp), timeZone);
    const representedUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute);
    const correction = targetUtc - representedUtc;
    timestamp += correction;
    if (correction === 0) break;
  }
  return timestamp;
}

function utcDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

export function getReportRanges(date = new Date(), timeZone = NOTIFICATION_TIME_ZONE) {
  const local = getZonedDateParts(date, timeZone);
  const today = { year: local.year, month: local.month, day: local.day };
  const tomorrow = utcDateParts(local.year, local.month, local.day + 1);
  const monthStart = { year: local.year, month: local.month, day: 1 };
  const daysSinceMonday = (new Date(Date.UTC(local.year, local.month - 1, local.day)).getUTCDay() + 6) % 7;
  const weekStartDate = new Date(Date.UTC(local.year, local.month - 1, local.day - daysSinceMonday));
  const weekStart = {
    year: weekStartDate.getUTCFullYear(),
    month: weekStartDate.getUTCMonth() + 1,
    day: weekStartDate.getUTCDate(),
  };

  return {
    today: {
      from: zonedTimeToUtc(today, timeZone),
      to: date.getTime(),
      end: zonedTimeToUtc(tomorrow, timeZone),
    },
    week: { from: zonedTimeToUtc(weekStart, timeZone), to: date.getTime() },
    month: { from: zonedTimeToUtc(monthStart, timeZone), to: date.getTime() },
  };
}

export function getScheduledSummaryKey(date = new Date(), timeZone = NOTIFICATION_TIME_ZONE) {
  const parts = getZonedDateParts(date, timeZone);
  const time = `${String(parts.hour).padStart(2, '0')}:${String(parts.minute).padStart(2, '0')}`;
  if (!NOTIFICATION_TIMES.includes(time)) return null;
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${time}`;
}

export function getDueSummaryKey(date = new Date(), timeZone = NOTIFICATION_TIME_ZONE) {
  const parts = getZonedDateParts(date, timeZone);
  const minutesNow = parts.hour * 60 + parts.minute;
  const dueTime = [...NOTIFICATION_TIMES].reverse().find((time) => {
    const [hour, minute] = time.split(':').map(Number);
    return hour * 60 + minute <= minutesNow && minutesNow - (hour * 60 + minute) <= 5;
  });
  if (!dueTime) return null;
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')} ${dueTime}`;
}

function formatAmount(amount) {
  return `FCFA ${amount.toLocaleString('en-US')}`;
}

function formatDate(date, timeZone) {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeZone }).format(date);
}

async function getAggregateSales(from, to) {
  const sales = await Sale.find({ created_at: { $gte: from, $lt: to }, status: 'completed' })
    .select('total credit_amount')
    .lean();
  return sales.reduce((total, sale) => total + sale.total, 0);
}

export async function sendDailySummaryNotification(now = new Date()) {
  const setting = await Setting.findById('main').lean();
  if (!setting?.adminEmail) {
    console.warn('Daily summary skipped: set a recipient email in Settings.');
    return false;
  }
  if (!setting.notifications?.dailySummary) {
    console.info('Daily summary skipped: daily summary emails are disabled in Settings.');
    return false;
  }

  const { today, week, month } = getReportRanges(now);
  const [sales, payments, expenses, customers, products, weekSales, monthSales] = await Promise.all([
    Sale.find({ created_at: { $gte: today.from, $lt: today.end }, status: 'completed' })
      .select('total paid_amount credit_amount')
      .lean(),
    Payment.find({ created_at: { $gte: today.from, $lt: today.end }, status: 'ok' })
      .select('kind amount')
      .lean(),
    Expense.find({ created_at: { $gte: today.from, $lt: today.end } })
      .select('category amount')
      .lean(),
    Customer.find({ active: true }).select('name balance').lean(),
    Product.find({ active: true, tracked: true }).select('name category unit stock lowStockThreshold').lean(),
    getAggregateSales(week.from, week.to + 1),
    getAggregateSales(month.from, month.to + 1),
  ]);

  const saleTotal = sales.reduce((sum, sale) => sum + sale.total, 0);
  const cashCollected = payments
    .filter((payment) => payment.kind === 'sale')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const debtRecovered = payments
    .filter((payment) => payment.kind === 'repayment')
    .reduce((sum, payment) => sum + payment.amount, 0);
  const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);
  const debtors = customers
    .filter((customer) => customer.balance > 0)
    .sort((a, b) => b.balance - a.balance);
  const outstandingDebt = debtors.reduce((sum, customer) => sum + customer.balance, 0);
  const outOfStock = products.filter((product) => product.stock <= 0);
  const lowStock = products.filter((product) =>
    product.stock > 0 && product.lowStockThreshold > 0 && product.stock <= product.lowStockThreshold
  );
  const trackedTotals = products.reduce((totals, product) => {
    totals.total += product.stock;
    if (product.category === 'Drinks') totals.drinks += product.stock;
    if (product.category === 'Meals') totals.meals += product.stock;
    return totals;
  }, { total: 0, drinks: 0, meals: 0 });

  const lines = [
    `Business summary · ${formatDate(now, NOTIFICATION_TIME_ZONE)} (${NOTIFICATION_TIME_ZONE})`,
    '',
    `Today's sales: ${formatAmount(saleTotal)}`,
    `Sales this week: ${formatAmount(weekSales)}`,
    `Sales this month: ${formatAmount(monthSales)}`,
    `Collected from sales today: ${formatAmount(cashCollected)}`,
    `Customer debt repaid today: ${formatAmount(debtRecovered)}`,
    `Expenses today: ${formatAmount(expenseTotal)}`,
    '',
    `Outstanding customer debt: ${formatAmount(outstandingDebt)} across ${debtors.length} customers`,
    `Tracked stock: ${trackedTotals.total} total · ${trackedTotals.drinks} drinks · ${trackedTotals.meals} food plates`,
    `Out of stock: ${outOfStock.length} · low stock: ${lowStock.length}`,
  ];

  if (debtors.length) {
    lines.push('', 'Customers owing the most:');
    for (const customer of debtors.slice(0, 5)) {
      lines.push(`• ${customer.name}: ${formatAmount(customer.balance)}`);
    }
  }
  if (outOfStock.length) {
    lines.push('', 'Out-of-stock products:', ...outOfStock.slice(0, 10).map((product) => `• ${product.name}`));
  }
  if (lowStock.length) {
    lines.push('', 'Low-stock products:', ...lowStock.slice(0, 10).map((product) =>
      `• ${product.name}: ${product.stock} ${product.unit || 'units'}`
    ));
  }
  if (expenses.length) {
    lines.push('', 'Expenses today:', ...expenses.slice(0, 10).map((expense) =>
      `• ${expense.category}: ${formatAmount(expense.amount)}`
    ));
  }

  return notifyAdmin(
    'dailySummary',
    `Business summary · ${formatDate(now, NOTIFICATION_TIME_ZONE)}`,
    lines.join('\n')
  );
}

async function sendUrgentDebtNotification(now = Date.now()) {
  const setting = await Setting.findById('main').lean();
  if (!setting || setting.notifications?.urgentDebt === false) return false;

  const customers = await Customer.find({ active: true, balance: { $gt: 0 } })
    .select('name balance')
    .sort({ balance: -1 })
    .lean();
  const outstandingDebt = customers.reduce((sum, customer) => sum + customer.balance, 0);
  if (outstandingDebt < URGENT_DEBT_THRESHOLD) return false;

  const message = [
    `Outstanding customer debt is ${formatAmount(outstandingDebt)} (urgent threshold: ${formatAmount(URGENT_DEBT_THRESHOLD)}).`,
    `Customers owing: ${customers.length}.`,
    '',
    ...customers.slice(0, 10).map((customer) => `• ${customer.name}: ${formatAmount(customer.balance)}`),
  ].join('\n');
  return notifyUrgentAdmin('urgentDebt', 'Urgent · customer debt is high', message, now);
}

async function sendOutOfStockNotification(now = Date.now()) {
  const setting = await Setting.findById('main').lean();
  if (!setting || setting.notifications?.outOfStock === false) return false;

  const products = await Product.find({ active: true, tracked: true, stock: { $lte: 0 } })
    .select('name unit')
    .sort({ name: 1 })
    .lean();
  if (!products.length) return false;

  const message = [
    `${products.length} tracked ${products.length === 1 ? 'product is' : 'products are'} out of stock:`,
    ...products.slice(0, 20).map((product) => `• ${product.name}`),
  ].join('\n');
  return notifyUrgentAdmin('outOfStock', 'Urgent · tracked products out of stock', message, now);
}

export async function checkAndSend(date = new Date()) {
  if (checkInProgress) return;
  checkInProgress = true;
  try {
    const summaryKey = getDueSummaryKey(date);
    if (
      summaryKey
      && summaryKey !== lastDailySummaryKey
      && date.getTime() - lastDailySummaryAttemptAt >= 60 * 1000
    ) {
      lastDailySummaryAttemptAt = date.getTime();
      const setting = await Setting.findById('main').select('notificationState.dailySummaryLastSentKey').lean();
      if (setting?.notificationState?.dailySummaryLastSentKey === summaryKey) {
        lastDailySummaryKey = summaryKey;
      } else {
        const sent = await sendDailySummaryNotification(date);
        if (sent) {
          await Setting.updateOne(
            { _id: 'main' },
            { $set: { 'notificationState.dailySummaryLastSentKey': summaryKey } }
          );
          console.info(`Scheduled business summary for ${summaryKey} (${NOTIFICATION_TIME_ZONE}).`);
          lastDailySummaryKey = summaryKey;
        }
      }
    }

    if (date.getTime() - lastUrgentCheckAt >= 5 * 60 * 1000) {
      lastUrgentCheckAt = date.getTime();
      await Promise.all([
        sendUrgentDebtNotification(date.getTime()),
        sendOutOfStockNotification(date.getTime()),
      ]);
    }
  } catch (error) {
    console.error('Notification scheduler check failed:', error.message || error);
  } finally {
    checkInProgress = false;
  }
}

export function startNotificationScheduler() {
  if (schedulerInterval) return schedulerInterval;

  console.info(`Notification scheduler started · ${NOTIFICATION_TIME_ZONE}`);
  console.info(`Daily email summaries: ${NOTIFICATION_TIMES.join(', ')}`);
  void checkAndSend();
  schedulerInterval = setInterval(() => void checkAndSend(), SCHEDULER_INTERVAL);
  return schedulerInterval;
}

export { sendUrgentDebtNotification };
