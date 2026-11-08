import { Setting } from './models.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const MAX_MESSAGES_PER_REQUEST = 100;

function isExpoPushToken(token) {
  return typeof token === 'string' && /^(Expo|Exponent)PushToken\[[^\]]+\]$/.test(token);
}

async function sendBatch(messages) {
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
    signal: AbortSignal.timeout(15_000),
  });
  const text = await response.text();
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error(`Expo push service returned an invalid response (HTTP ${response.status}).`);
  }
  if (!response.ok || !Array.isArray(payload.data)) {
    throw new Error(payload.errors?.[0]?.message || `Expo push request failed (HTTP ${response.status}).`);
  }
  return payload.data;
}

export async function sendExpoPush(tokens, { title, body, data = {} }) {
  const validTokens = [...new Set((tokens || []).filter(isExpoPushToken))];
  if (!validTokens.length) return false;

  const invalidTokens = [];
  let accepted = false;
  for (let start = 0; start < validTokens.length; start += MAX_MESSAGES_PER_REQUEST) {
    const batchTokens = validTokens.slice(start, start + MAX_MESSAGES_PER_REQUEST);
    const tickets = await sendBatch(batchTokens.map((to) => ({
      to,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
      channelId: 'default',
    })));

    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') {
        accepted = true;
      } else {
        console.error('Expo push ticket failed:', ticket.message || ticket.details?.error || 'Unknown error');
        if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(batchTokens[index]);
      }
    });
  }

  if (invalidTokens.length) {
    await Setting.updateOne({ _id: 'main' }, { $pull: { expoPushTokens: { $in: invalidTokens } } });
  }
  return accepted;
}
