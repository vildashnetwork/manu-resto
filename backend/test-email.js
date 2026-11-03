import 'dotenv/config';

const TO = 'liblissz3@gmail.com';

async function sendHello() {
    const apiKey = process.env.BREVO_API_KEY;
    const senderEmail = process.env.BREVO_SENDER_EMAIL;

    console.log('BREVO_API_KEY set:   ', !!apiKey, apiKey ? `(${apiKey.slice(0, 12)}...)` : '');
    console.log('BREVO_SENDER_EMAIL:  ', senderEmail);
    console.log('TO:                  ', TO);

    if (!apiKey) throw new Error('BREVO_API_KEY missing in .env');
    if (!senderEmail) throw new Error('BREVO_SENDER_EMAIL missing in .env');

    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
        method: 'POST',
        headers: {
            accept: 'application/json',
            'api-key': apiKey,
            'content-type': 'application/json',
        },
        body: JSON.stringify({
            sender: { name: "Manu's Resto Manager", email: senderEmail },
            to: [{ email: TO }],
            subject: 'Hello from Manu\'s Resto 👋',
            textContent: `Hello!\n\nThis is a test email sent at ${new Date().toISOString()}.\n\nIf you received it, Brevo is working. ✅`,
        }),
    });

    const bodyText = await response.text();
    console.log('HTTP status:', response.status);
    console.log('Response:   ', bodyText);

    if (!response.ok) {
        throw new Error(`Brevo rejected (HTTP ${response.status}): ${bodyText}`);
    }

    console.log('✅ Hello email sent to', TO);
}

sendHello().catch((err) => {
    console.error('💥 Failed:', err.message || err);
    process.exit(1);
});