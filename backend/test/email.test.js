import assert from 'node:assert/strict';
import test from 'node:test';
import { renderNotificationEmail } from '../src/email.js';

test('notification emails use the Manu Resto brand and chosen alert theme', () => {
  const html = renderNotificationEmail({
    subject: 'Urgent · stock alert',
    message: 'A tracked item needs attention.',
    type: 'outOfStock',
  });

  assert.match(html, /Manu's Resto/);
  assert.match(html, /Urgent stock alert/);
  assert.match(html, /color:#B3402F/);
  assert.match(html, /A tracked item needs attention\./);
});

test('notification email content safely formats summary rows and bullet lists', () => {
  const html = renderNotificationEmail({
    subject: '<Daily summary>',
    message: `Today's sales: FCFA 20,000\n\nCustomers owing:\n• A <Customer>: FCFA 4,000`,
    type: 'dailySummary',
  });

  assert.match(html, /&lt;Daily summary&gt;/);
  assert.match(html, /Today&#39;s sales/);
  assert.match(html, /Customers owing<\/h3>/);
  assert.match(html, /A &lt;Customer&gt;/);
  assert.match(html, /<ul /);
});
