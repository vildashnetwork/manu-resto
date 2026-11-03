import { Setting } from './models.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RETRY_DELAYS = [500, 1500];
export const URGENT_REMINDER_INTERVAL = 6 * 60 * 60 * 1000;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendEmail({ recipient, subject, message }) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;
  if (!apiKey || !senderEmail) {
    throw new Error('BREVO_API_KEY and BREVO_SENDER_EMAIL must be configured in the backend environment.');
  }
  if (!recipient) throw new Error('No notification recipient is configured in Settings.');

  for (let attempt = 0; ; attempt += 1) {
    let response;
    try {
      response = await fetch(BREVO_URL, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'api-key': apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          sender: { name: "Manu's Resto Manager", email: senderEmail },
          to: [{ email: recipient }],
          subject,
          textContent: message,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      if (attempt < RETRY_DELAYS.length) {
        await wait(RETRY_DELAYS[attempt]);
        continue;
      }
      throw new Error(`Could not reach Brevo to send email: ${error.message || error}`);
    }

    const body = await response.text();
    if (response.ok) return true;

    if ((response.status === 429 || response.status >= 500) && attempt < RETRY_DELAYS.length) {
      await wait(RETRY_DELAYS[attempt]);
      continue;
    }

    let detail = body;
    try {
      const payload = JSON.parse(body);
      detail = payload.message || payload.code || body;
    } catch {
      // Keep Brevo's response text when it is not JSON.
    }
    throw new Error(`Brevo rejected the notification (HTTP ${response.status}): ${detail || 'No response details.'}`);
  }
}

export async function notifyAdmin(type, subject, message) {
  try {
    const setting = await Setting.findById('main').lean();
    if (!setting?.adminEmail) {
      console.warn(`Could not send "${subject}": set a recipient email in Settings.`);
      return false;
    }
    if (setting.notifications?.[type] === false) {
      console.info(`Skipped "${subject}": the ${type} email notification is disabled in Settings.`);
      return false;
    }
    await sendEmail({ recipient: setting.adminEmail, subject, message });
    console.info(`Email sent to the configured admin recipient (${type}).`);
    return true;
  } catch (error) {
    console.error(`Could not send ${type} email notification:`, error.message || error);
    return false;
  }
}

export async function notifyUrgentAdmin(type, subject, message, now = Date.now()) {
  if (type !== 'urgentDebt' && type !== 'outOfStock') {
    throw new Error(`Unsupported urgent notification type: ${type}`);
  }
  try {
    const setting = await Setting.findById('main').lean();
    if (!setting?.adminEmail) {
      return notifyAdmin(type, subject, message);
    }
    if (setting.notifications?.[type] === false) {
      console.info(`Skipped "${subject}": the ${type} email notification is disabled in Settings.`);
      return false;
    }
    const stateKey = type === 'urgentDebt' ? 'urgentDebtLastSentAt' : 'outOfStockLastSentAt';
    const lastSentAt = setting.notificationState?.[stateKey] || 0;
    if (now - lastSentAt < URGENT_REMINDER_INTERVAL) return false;

    const sent = await notifyAdmin(type, subject, message);
    if (sent) {
      await Setting.updateOne(
        { _id: 'main' },
        { $set: { [`notificationState.${stateKey}`]: now } }
      );
    }
    return sent;
  } catch (error) {
    console.error(`Could not send urgent ${type} email notification:`, error.message || error);
    return false;
  }
}

export async function sendTestEmail() {
  const setting = await Setting.findById('main').lean();
  if (!setting?.adminEmail) throw new Error('Set and save a notification email address in Settings first.');
  await sendEmail({
    recipient: setting.adminEmail,
    subject: "Manu's Resto Manager email test",
    message: 'This is a test email. Your backend email settings can deliver messages to this address.',
  });
  return setting.adminEmail;
}
