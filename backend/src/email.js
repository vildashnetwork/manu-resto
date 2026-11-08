import { Setting } from './models.js';
import { sendExpoPush } from './push.js';

const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const RETRY_DELAYS = [500, 1500];
export const URGENT_REMINDER_INTERVAL = 60 * 60 * 1000;

const EMAIL_THEMES = {
  urgentDebt: { accent: '#B3402F', tint: '#F8E5E1', label: 'Urgent debt alert' },
  outOfStock: { accent: '#B3402F', tint: '#F8E5E1', label: 'Urgent stock alert' },
  lowStock: { accent: '#C27A1A', tint: '#FFF1D8', label: 'Stock update' },
  creditDebt: { accent: '#52705A', tint: '#E8EFEA', label: 'Customer account update' },
  customerPayments: { accent: '#52705A', tint: '#E8EFEA', label: 'Customer repayment' },
  sales: { accent: '#1E3A2B', tint: '#E8EFEA', label: 'Sale recorded' },
  stock: { accent: '#C27A1A', tint: '#FFF1D8', label: 'Stock update' },
  expenses: { accent: '#C8A24A', tint: '#F7EFD9', label: 'Expense recorded' },
  dailySummary: { accent: '#1E3A2B', tint: '#E8EFEA', label: 'Daily business summary' },
  test: { accent: '#2E7D4F', tint: '#E4F2E8', label: 'Email delivery test' },
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMessage(message) {
  const rows = [];
  let bullets = [];
  const flushBullets = () => {
    if (bullets.length) {
      rows.push(`<ul style="margin:8px 0 16px;padding:0 0 0 22px;color:#424A44;">${bullets.map((item) => `<li style="padding:3px 0;line-height:1.55;">${escapeHtml(item)}</li>`).join('')}</ul>`);
      bullets = [];
    }
  };

  for (const rawLine of String(message).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      flushBullets();
      continue;
    }
    const bullet = line.match(/^[•*-]\s+(.+)$/);
    if (bullet) {
      bullets.push(bullet[1]);
      continue;
    }
    flushBullets();
    const colon = line.indexOf(':');
    if (colon > 0) {
      const label = line.slice(0, colon).trim();
      const value = line.slice(colon + 1).trim();
      if (value) {
        rows.push(`<div style="padding:10px 0;border-bottom:1px solid #E4DECF;line-height:1.5;"><span style="color:#6B726D;">${escapeHtml(label)}</span><strong style="float:right;margin-left:12px;color:#1B1F1D;text-align:right;">${escapeHtml(value)}</strong></div>`);
      } else {
        rows.push(`<h3 style="margin:20px 0 6px;color:#1E3A2B;font-size:15px;">${escapeHtml(label)}</h3>`);
      }
    } else {
      rows.push(`<p style="margin:0 0 12px;color:#424A44;line-height:1.65;">${escapeHtml(line)}</p>`);
    }
  }
  flushBullets();
  return rows.join('');
}

export function renderNotificationEmail({ subject, message, type = 'dailySummary' }) {
  const theme = EMAIL_THEMES[type] || EMAIL_THEMES.dailySummary;
  const safeSubject = escapeHtml(subject);
  const safeLabel = escapeHtml(theme.label);
  const safeMessage = renderMessage(message);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="x-apple-disable-message-reformatting"><title>${safeSubject}</title></head>
<body style="margin:0;padding:0;background:#F7F2E8;font-family:Arial,Helvetica,sans-serif;color:#1B1F1D;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safeLabel} · Manu's Resto Manager</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F7F2E8;">
    <tr><td align="center" style="padding:28px 14px;">
      <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;">
        <tr><td style="padding:22px 26px;background:#1E3A2B;border-radius:16px 16px 0 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
            <td width="46" valign="middle"><div style="width:38px;height:38px;line-height:38px;border-radius:11px;background:#C8A24A;color:#142A1E;text-align:center;font-size:13px;font-weight:800;">MR</div></td>
            <td valign="middle"><div style="font-size:17px;font-weight:700;letter-spacing:.2px;color:#FFFFFF;">Manu's Resto</div><div style="margin-top:4px;font-size:11px;letter-spacing:1.4px;text-transform:uppercase;color:#D9E3DA;">Restaurant manager</div></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:28px 26px 26px;background:#FFFFFF;border:1px solid #E4DECF;border-top:0;">
          <div style="display:inline-block;margin-bottom:14px;padding:6px 10px;border-radius:20px;background:${theme.tint};color:${theme.accent};font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;">${safeLabel}</div>
          <h1 style="margin:0 0 20px;color:#1E3A2B;font-size:24px;line-height:1.3;">${safeSubject}</h1>
          <div style="font-size:14px;">${safeMessage}</div>
        </td></tr>
        <tr><td style="padding:17px 20px;background:#F7F2E8;border:1px solid #E4DECF;border-top:0;border-radius:0 0 16px 16px;text-align:center;">
          <div style="color:#6B726D;font-size:11px;line-height:1.6;">Automated update from Manu's Resto Manager<br>Manage email preferences in your app Settings.</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendEmail({ recipient, subject, message, type }) {
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
          htmlContent: renderNotificationEmail({ subject, message, type }),
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
    if (!setting || setting.notifications?.[type] === false) {
      console.info(`Skipped "${subject}": the ${type} notification is disabled in Settings.`);
      return false;
    }
    let pushSent = false;
    if (type !== 'dailySummary' && setting.expoPushTokens?.length) {
      pushSent = await sendExpoPush(setting.expoPushTokens, {
        title: subject,
        body: message,
        data: { type },
      }).catch((error) => {
        console.error(`Could not send ${type} push notification:`, error.message || error);
        return false;
      });
    }
    if (!setting.adminEmail) {
      console.warn(`Could not send "${subject}" email: set a recipient email in Settings.`);
      return pushSent;
    }
    await sendEmail({ recipient: setting.adminEmail, subject, message, type });
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
    type: 'test',
  });
  return setting.adminEmail;
}
