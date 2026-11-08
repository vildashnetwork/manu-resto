import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Btn, Card, Field, Hero, ScreenShimmer, useLoad, screenStyle } from '../src/components/ui';
import {
  getSettings,
  registerExpoPushToken,
  sendTestEmail,
  unregisterExpoPushToken,
  updateSettings,
} from '../src/api/repo';
import { getCurrentExpoPushToken, registerForPushNotifications } from '../src/api/pushNotifications';
import { colors, radius } from '../src/theme';

const DEFAULT_NOTIFICATIONS = {
  lowStock: true,
  creditDebt: true,
  expenses: true,
  dailySummary: true,
  urgentDebt: true,
  outOfStock: true,
  sales: true,
  stock: true,
  customerPayments: true,
  noSales: true,
};

const NOTIFICATION_OPTIONS = [
  { key: 'sales', title: 'Sales recorded', detail: 'App push when a new sale is saved.' },
  { key: 'lowStock', title: 'Low stock alerts', detail: 'Email and app push when tracked stock reaches its configured threshold.' },
  { key: 'creditDebt', title: 'Customer debt increases', detail: 'Email and app push when a credit sale or opening balance adds to debt.' },
  { key: 'customerPayments', title: 'Customer repayments', detail: 'App push when a customer payment is recorded.' },
  { key: 'stock', title: 'Stock changes', detail: 'App push when stock is added, removed, or adjusted.' },
  { key: 'expenses', title: 'Expenses recorded', detail: 'Email and app push when a new expense is entered.' },
  { key: 'dailySummary', title: 'Hourly business summaries', detail: 'Email sales, customer debt, stock, and expenses every hour, all day.' },
  { key: 'urgentDebt', title: 'Customer debt reminders', detail: 'App push every 10 minutes while customer debt remains unpaid.' },
  { key: 'outOfStock', title: 'Out-of-stock reminders', detail: 'Email when tracked products run out; app push every 10 minutes while any remain out.' },
  { key: 'noSales', title: 'Days without sales', detail: 'App push every 10 minutes after a full day passes without a recorded sale.' },
];

export default function Settings() {
  const [loaded, , loading] = useLoad(getSettings);
  const [email, setEmail] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderConfigured, setSenderConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushToken, setPushToken] = useState(null);
  const [pushBusy, setPushBusy] = useState(false);

  useEffect(() => {
    if (!loaded) return;
    setEmail(loaded.adminEmail || '');
    setSavedEmail((loaded.adminEmail || '').trim().toLowerCase());
    setNotifications({ ...DEFAULT_NOTIFICATIONS, ...loaded.notifications });
    setSenderEmail(loaded.senderEmail || '');
    setSenderConfigured(Boolean(loaded.senderConfigured));
    setPushEnabled(Boolean(loaded.pushNotificationsEnabled));
    getCurrentExpoPushToken()
      .then((token) => { if (token) setPushToken(token); })
      .catch((error) => console.warn('Could not read the app push token:', error.message || error));
  }, [loaded]);

  async function enablePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const token = await registerForPushNotifications();
      await registerExpoPushToken(token);
      setPushToken(token);
      setPushEnabled(true);
      Alert.alert('App notifications enabled', 'This device is registered for sales, customer debt, stock, and business reminders.');
    } catch (error) {
      Alert.alert('Could not enable app notifications', error.message || String(error));
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePush() {
    if (pushBusy) return;
    setPushBusy(true);
    try {
      const token = pushToken || await getCurrentExpoPushToken();
      if (!token) throw new Error('Allow notifications in Android settings first, then try again.');
      const result = await unregisterExpoPushToken(token);
      setPushToken(null);
      setPushEnabled(Boolean(result.pushNotificationsEnabled));
      Alert.alert('Device notifications disabled', 'This device will no longer receive app push alerts.');
    } catch (error) {
      Alert.alert('Could not disable app notifications', error.message || String(error));
    } finally {
      setPushBusy(false);
    }
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await updateSettings({ adminEmail: email.trim(), notifications });
      setEmail(saved.adminEmail || '');
      setSavedEmail((saved.adminEmail || '').trim().toLowerCase());
      setNotifications({ ...DEFAULT_NOTIFICATIONS, ...saved.notifications });
      setSenderEmail(saved.senderEmail || '');
      setSenderConfigured(Boolean(saved.senderConfigured));
      Alert.alert('Settings saved', 'Email notification preferences have been updated.');
    } catch (error) {
      Alert.alert('Could not save settings', error.message || String(error));
    } finally {
      setSaving(false);
    }
  }

  async function testEmail() {
    if (testingEmail) return;
    setTestingEmail(true);
    try {
      const result = await sendTestEmail();
      Alert.alert('Test email sent', `Check ${result.recipient} for the test message.`);
    } catch (error) {
      Alert.alert('Test email failed', error.message || String(error));
    } finally {
      setTestingEmail(false);
    }
  }

  if (loading && !loaded) return <ScreenShimmer variant="list" />;

  return (
    <ScrollView style={screenStyle} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Hero eyebrow="Workspace preferences" title="Settings">
        <Text style={s.heroText}>Manage admin email alerts for your restaurant.</Text>
      </Hero>

      <View style={s.body}>
        <Card>
          <Text style={s.sectionTitle}>Admin email</Text>
          <Text style={s.description}>This address receives the notifications you enable below.</Text>
          <Field
            label="Notification email"
            value={email}
            onChangeText={setEmail}
            placeholder="admin@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
          />
          <View style={s.senderBox}>
            <Text style={s.senderLabel}>Email sender</Text>
            <Text style={s.senderValue}>{senderEmail || 'Not configured on backend'}</Text>
            <Text style={[s.senderStatus, { color: senderConfigured ? colors.ok : colors.warn }]}>
              {senderConfigured ? 'email is configured' : 'Set your email to get notifications.'}
            </Text>
          </View>
          <Btn
            title={testingEmail ? 'Sending test email…' : 'Send test email'}
            icon="mail-outline"
            variant="soft"
            onPress={testEmail}
            disabled={testingEmail || !email.trim() || email.trim().toLowerCase() !== savedEmail}
            style={{ marginTop: 12 }}
          />
          {email.trim().toLowerCase() !== savedEmail && (
            <Text style={s.description}>Save your updated email address before sending a test.</Text>
          )}
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={s.sectionTitle}>App push notifications</Text>
          <Text style={s.description}>
            Register this device to receive alerts even when the app is closed. Active debt, low-stock, out-of-stock, and no-sales reminders repeat every 10 minutes.
          </Text>
          <Text style={s.pushStatus}>
            {pushEnabled
              ? `Push is registered on ${loaded?.pushDeviceCount || 1} device(s).`
              : 'Push notifications are not registered yet.'}
          </Text>
          <View style={s.pushActions}>
            <Btn
              title={pushBusy ? 'Working…' : 'Enable on this device'}
              icon="notifications-outline"
              onPress={enablePush}
              disabled={pushBusy}
              style={{ flex: 1 }}
            />
            {pushToken ? (
              <Btn
                title="Disable"
                variant="soft"
                onPress={disablePush}
                disabled={pushBusy}
                style={{ flex: 1 }}
              />
            ) : null}
          </View>
          <Text style={s.description}>
            Android may delay or suppress push alerts due to battery or network settings. Allow notifications for Manu’s Resto Manager in Android settings.
          </Text>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={s.sectionTitle}>Email notifications</Text>
          <Text style={s.description}>These preferences also control app alerts of the same type. Business summary emails continue every hour.</Text>
          {NOTIFICATION_OPTIONS.map((option, index) => (
            <View key={option.key} style={[s.option, index === NOTIFICATION_OPTIONS.length - 1 && s.optionLast]}>
              <View style={s.optionText}>
                <Text style={s.optionTitle}>{option.title}</Text>
                <Text style={s.optionDescription}>{option.detail}</Text>
              </View>
              <Switch
                value={Boolean(notifications[option.key])}
                onValueChange={(enabled) => setNotifications((current) => ({ ...current, [option.key]: enabled }))}
                trackColor={{ false: colors.line, true: colors.forestMid }}
                thumbColor={notifications[option.key] ? colors.forest : '#f4f3f4'}
                accessibilityLabel={option.title}
              />
            </View>
          ))}
        </Card>

        <Btn
          title={saving ? 'Saving…' : 'Save settings'}
          icon="checkmark"
          onPress={save}
          disabled={saving}
          style={{ marginTop: 18 }}
        />
        <Text style={s.note}>Brevo credentials are kept on the backend and are never stored in this app.</Text>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 30 },
  body: { padding: 16 },
  heroText: { color: 'rgba(255,255,255,0.78)', marginTop: 8, fontSize: 13 },
  sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 },
  senderBox: { backgroundColor: colors.cream, padding: 12, borderRadius: radius.md, marginTop: 2 },
  senderLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  senderValue: { color: colors.ink, fontSize: 14, fontWeight: '700', marginTop: 4 },
  senderStatus: { fontSize: 12, lineHeight: 17, marginTop: 5 },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  optionLast: { borderBottomWidth: 0, paddingBottom: 2 },
  optionText: { flex: 1 },
  optionTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  optionDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
  pushStatus: { color: colors.forest, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  pushActions: { flexDirection: 'row', gap: 8, marginBottom: 12 },
});
