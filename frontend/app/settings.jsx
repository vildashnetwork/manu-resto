import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Btn, Card, Field, Hero, ScreenShimmer, useLoad, screenStyle } from '../src/components/ui';
import { getSettings, updateSettings } from '../src/api/repo';
import { colors, radius } from '../src/theme';
import { getAppMode, hasOfflineSnapshot, setAppMode } from '../src/db';

const DEFAULT_NOTIFICATIONS = { lowStock: true, creditDebt: true, expenses: true };

const NOTIFICATION_OPTIONS = [
  { key: 'lowStock', title: 'Low stock alerts', detail: 'Email when tracked stock reaches its configured threshold.' },
  { key: 'creditDebt', title: 'Customer debt increases', detail: 'Email when a credit sale or opening balance adds to debt.' },
  { key: 'expenses', title: 'Expenses recorded', detail: 'Email when a new expense is entered.' },
];

export default function Settings() {
  const router = useRouter();
  const [loaded, , loading] = useLoad(getSettings);
  const [email, setEmail] = useState('');
  const [notifications, setNotifications] = useState(DEFAULT_NOTIFICATIONS);
  const [senderEmail, setSenderEmail] = useState('');
  const [senderConfigured, setSenderConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [modeBusy, setModeBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    Promise.all([getAppMode(), hasOfflineSnapshot()]).then(([currentMode, ready]) => {
      if (!mounted) return;
      setMode(currentMode);
      setOfflineReady(ready);
    }).catch((error) => Alert.alert('Could not read offline settings', error.message || String(error)));
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    setEmail(loaded.adminEmail || '');
    setNotifications({ ...DEFAULT_NOTIFICATIONS, ...loaded.notifications });
    setSenderEmail(loaded.senderEmail || '');
    setSenderConfigured(Boolean(loaded.senderConfigured));
  }, [loaded]);

  async function changeMode(nextMode) {
    if (modeBusy || nextMode === mode) return;
    if (nextMode === 'offline' && !offlineReady) {
      Alert.alert('Download data first', 'Sync your products, customers, sales, and images while online before turning on offline mode.');
      return;
    }
    setModeBusy(true);
    try {
      await setAppMode(nextMode);
      setMode(nextMode);
      if (nextMode === 'online') {
        router.push('/sync?start=1');
      }
    } catch (error) {
      Alert.alert('Could not change connection mode', error.message || String(error));
    } finally {
      setModeBusy(false);
    }
  }

  function startSync() {
    router.push('/sync?start=1');
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      const saved = await updateSettings({ adminEmail: email.trim(), notifications });
      setEmail(saved.adminEmail || '');
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

  if (loading && !loaded) return <ScreenShimmer variant="list" />;

  return (
    <ScrollView style={screenStyle} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      <Hero eyebrow="Workspace preferences" title="Settings">
        <Text style={s.heroText}>Manage admin email alerts for your restaurant.</Text>
      </Hero>

      <View style={s.body}>
        <Card>
          <Text style={s.sectionTitle}>Connection mode</Text>
          <Text style={s.description}>Offline mode uses data and product images saved on this phone. Sync before your first offline session.</Text>
          <View style={s.modeRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.optionTitle}>{mode === 'offline' ? 'Offline mode' : 'Online mode'}</Text>
              <Text style={s.optionDescription}>{mode === 'offline' ? 'Changes are saved locally until you switch online.' : 'Online data is used. Sync is started when you switch online.'}</Text>
            </View>
            <Switch
              value={mode === 'online'}
              onValueChange={(online) => changeMode(online ? 'online' : 'offline')}
              disabled={mode === null || modeBusy}
              trackColor={{ false: colors.line, true: colors.forestMid }}
              thumbColor={mode === 'online' ? colors.forest : '#f4f3f4'}
              accessibilityLabel="Online mode"
            />
          </View>
          {!offlineReady ? <Text style={s.warning}>Offline data is not ready on this phone yet.</Text> : null}
          <Btn title="Sync data and prepare offline" icon="cloud-download-outline" onPress={startSync} style={{ marginTop: 12 }} />
          <Pressable onPress={() => router.push('/sync')} style={s.syncLink}>
            <Text style={s.syncLinkText}>View sync progress and pending changes</Text>
          </Pressable>
        </Card>

        <Card style={{ marginTop: 14 }}>
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
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={s.sectionTitle}>Email notifications</Text>
          <Text style={s.description}>Alerts are sent after the corresponding backend action succeeds.</Text>
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
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  warning: { color: colors.warn, fontSize: 12, lineHeight: 17, marginTop: 6 },
  syncLink: { paddingTop: 12, alignItems: 'center' },
  syncLinkText: { color: colors.forest, fontSize: 13, fontWeight: '700' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  optionLast: { borderBottomWidth: 0, paddingBottom: 2 },
  optionText: { flex: 1 },
  optionTitle: { color: colors.ink, fontSize: 14, fontWeight: '700' },
  optionDescription: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  note: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
});
