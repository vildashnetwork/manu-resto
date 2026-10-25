import { Setting } from './models.js';

export async function notifyAdmin(type, subject, message) {
  try {
    const setting = await Setting.findById('main').lean();
    if (!setting?.notifications?.[type] || !setting.adminEmail) return;

    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;
    if (!apiKey || !senderEmail) {
      throw new Error('BREVO_API_KEY and BREVO_SENDER_EMAIL must be configured in the backend environment.');
    }

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { name: "Manu's Resto Manager", email: senderEmail },
        to: [{ email: setting.adminEmail }],
        subject,
        textContent: message,
      }),
    });
    if (!response.ok) {
      throw new Error(`Brevo rejected the notification (HTTP ${response.status}).`);
    }
  } catch (error) {
    console.error('Could not send admin email notification:', error.message || error);
  }
}
