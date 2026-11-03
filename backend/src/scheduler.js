import 'dotenv/config';
import mongoose from 'mongoose';
import { Customer, Expense, Sale, Payment, Setting } from './models.js';
import { notifyAdmin } from './email.js';

const NOTIFICATION_TIMES = ['07:00', '09:00', '12:00', '19:00'];

export async function sendDailySummaryNotification() {
  try {
    const now = new Date();
    const setting = await Setting.findById('main').lean();

    if (!setting?.adminEmail) {
      console.log('No admin email configured, skipping notification.');
      return;
    }

    // Calculate today's earnings
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(todayStart);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);

    const [sales, payments, expenses, customers] = await Promise.all([
      Sale.find({ created_at: { $gte: todayStart, $lt: tomorrowStart } }).lean(),
      Payment.find({ created_at: { $gte: todayStart, $lt: tomorrowStart }, status: 'ok' }).lean(),
      Expense.find({ created_at: { $gte: todayStart, $lt: tomorrowStart } }).lean(),
      Customer.find({ active: true }).select('balance').lean(),
    ]);

    const completedSales = sales.filter((s) => s.status === 'completed');
    const salePayments = payments.filter((p) => p.kind === 'sale');
    const repayments = payments.filter((p) => p.kind === 'repayment');

    const totalSales = completedSales.reduce((sum, sale) => sum + sale.total, 0);
    const cashFromSales = salePayments.reduce((sum, payment) => sum + payment.amount, 0);
    const creditSales = completedSales.reduce((sum, sale) => sum + sale.credit_amount, 0);
    const debtRecovered = repayments.reduce((sum, payment) => sum + payment.amount, 0);
    const expenseTotal = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    const outstandingDebt = customers.reduce((sum, customer) => sum + Math.max(0, customer.balance), 0);
    const debtorCount = customers.filter((customer) => customer.balance > 0).length;

    // Calculate stuck/uncollected credit
    const totalCreditOutstanding = completedSales.reduce((sum, sale) => {
      const repaymentsForSale = repayments.filter(p => String(p.saleId) === String(sale._id)).reduce((s, p) => s + p.amount, 0);
      return sum + Math.max(0, sale.credit_amount - repaymentsForSale);
    }, 0);

    // Heavy debt customers
    const heavyDebtCustomers = customers
      .filter((c) => c.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .slice(0, 5);

    // Prepare message
    let message = `📊 DAILY SUMMARY - ${now.toLocaleDateString()} ${now.toLocaleTimeString()}\n\n`;

    message += `💰 TODAY'S EARNINGS:\n`;
    message += `   • Total Sales: FCFA ${totalSales.toLocaleString()}\n`;
    message += `   • Cash Received: FCFA ${cashFromSales.toLocaleString()}\n`;
    message += `   • Credit Sales: FCFA ${creditSales.toLocaleString()}\n`;
    message += `   • Debt Recovered: FCFA ${debtRecovered.toLocaleString()}\n`;
    message += `   • Expenses: FCFA ${expenseTotal.toLocaleString()}\n`;
    message += `   • Net Profit: FCFA ${(totalSales - expenseTotal).toLocaleString()}\n\n`;

    message += `👥 OUTSTANDING DEBT:\n`;
    message += `   • Total Owed: FCFA ${outstandingDebt.toLocaleString()}\n`;
    message += `   • Number of Debtors: ${debtorCount}\n\n`;

    message += `💳 STUCK/UNCOLLECTED CREDIT:\n`;
    message += `   • Total Credit Outstanding: FCFA ${totalCreditOutstanding.toLocaleString()}\n\n`;

    if (heavyDebtCustomers.length > 0) {
      message += `⚠️ TOP DEBTORS (Heavy Debt):\n`;
      heavyDebtCustomers.forEach((customer, idx) => {
        message += `   ${idx + 1}. ${customer.name || 'Unknown'}: FCFA ${customer.balance.toLocaleString()}\n`;
      });
      message += `\n`;
    }

    await notifyAdmin(
      'daily_summary',
      `Daily Summary - ${now.toLocaleDateString()}`,
      message
    );

    console.log('✅ Daily summary notification sent successfully.');
  } catch (error) {
    console.error('❌ Error sending daily summary notification:', error.message || error);
  }
}

// Check if current time matches a notification time
export function checkAndSend() {
  const now = new Date();

  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const timeKey = `${hour}:${minute}`;

  if (NOTIFICATION_TIMES.includes(timeKey)) {
    // Only send if seconds are 00 to avoid duplicates
    if (now.getSeconds() > 30) return;
    console.log(`⏰ Time match: ${timeKey} - sending daily summary notification`);
    sendDailySummaryNotification();
  }
}

// Start scheduler - checks every 30 minutes
export function startNotificationScheduler() {
  console.log('🕐 Starting notification scheduler...');
  console.log(`📅 Scheduled times: ${NOTIFICATION_TIMES.join(', ')}`);

  // Check immediately on startup
  checkAndSend();

  // Check every 30 minutes
  const intervalId = setInterval(checkAndSend, 30 * 60 * 1000);

  return intervalId;
}

// For urgent notifications (heavy debt or out of stuck)
export async function sendUrgentDebtNotification() {
  try {
    const setting = await Setting.findById('main').lean();
    if (!setting?.adminEmail) return;

    const customers = await Customer.find({ active: true }).select('balance').lean();
    const outstandingDebt = customers.reduce((sum, customer) => sum + Math.max(0, customer.balance), 0);

    const HEAVY_DEBT_THRESHOLD = 100000;

    if (outstandingDebt >= HEAVY_DEBT_THRESHOLD) {
      const message = `⚠️ URGENT: Outstanding debt has reached FCFA ${outstandingDebt.toLocaleString()}. Immediate action required.\n\nTotal debtors: ${customers.filter(c => c.balance > 0).length}\nThis is an automated alert from Manu's Resto Manager.`;

      await notifyAdmin(
        'urgent_debt',
        `URGENT: Heavy Outstanding Debt - FCFA ${outstandingDebt.toLocaleString()}`,
        message
      );
      console.log('⚠️ Urgent debt notification sent.');
    } else {
      console.log('✅ No urgent debt alert needed (below threshold).');
    }
  } catch (error) {
    console.error('❌ Error sending urgent debt notification:', error.message || error);
  }
}

// Start scheduler on module import
let schedulerInterval = null;

try {
  schedulerInterval = startNotificationScheduler();
} catch (error) {
  console.error('❌ Failed to start notification scheduler:', error.message || error);
}

export { schedulerInterval };