import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Btn, Card, Hero, Pill, Section, screenStyle, useLoad } from '../src/components/ui';
import { getBackendAvailability, getConnectionMode, getSyncStatus, retrySync, setConnectionMode, syncNow } from '../src/api/repo';
import { colors } from '../src/theme';
import { fmtDateTime } from '../src/utils';

export default function SyncCenter() {
  const [status, reload] = useLoad(getSyncStatus);
  const [mode, setMode] = useState('online');
  const [availability, setAvailability] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getConnectionMode().then(setMode).catch((error) => Alert.alert('Could not read connection mode', error.message || String(error)));
    const timer = setInterval(reload, 1000);
    return () => clearInterval(timer);
  }, [reload]);

  async function checkConnection() {
    const result = await getBackendAvailability();
    setAvailability(result);
  }

  async function pauseSync() {
    try {
      await setConnectionMode('offline');
      setMode('offline');
      await reload();
    } catch (error) {
      Alert.alert('Could not pause sync', error.message || String(error));
    }
  }

  async function runSync(retry = false) {
    if (busy) return;
    setBusy(true);
    try {
      if (retry) await retrySync();
      else await syncNow();
      await reload();
    } catch (error) {
      Alert.alert('Sync paused', error.message || String(error));
      await reload();
    } finally {
      setBusy(false);
    }
  }

  const pendingCount = status?.pending || 0;
  const failedCount = status?.failed || 0;
  const total = status?.total || 0;
  const processed = status?.processed || 0;

  return (
    <ScrollView style={screenStyle} contentContainerStyle={s.content}>
      <Hero eyebrow="Local-first data" title="Sync Center">
        <Text style={s.heroText}>Your changes are stored on this device first. Sync runs separately in the background.</Text>
      </Hero>

      <View style={s.body}>
        <Card>
          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Selected mode</Text>
              <Text style={s.detail}>Internet availability is checked separately from this preference.</Text>
            </View>
            <Pill label={mode === 'online' ? 'Online' : 'Offline'} tone={mode === 'online' ? 'ok' : 'warn'} />
          </View>
          <View style={[s.row, { marginTop: 14 }]}>
            <View style={{ flex: 1 }}>
              <Text style={s.title}>Backend reachability</Text>
              <Text style={s.detail}>
                {availability
                  ? availability.reachable
                    ? availability.database === 'connected' ? 'API and database connected' : 'API reachable; database is disconnected'
                    : availability.error
                  : 'Not checked'}
              </Text>
            </View>
            <Btn small variant="soft" title="Check" onPress={checkConnection} />
          </View>
        </Card>

        <Card style={{ marginTop: 14 }}>
          <Text style={s.title}>Synchronization progress</Text>
          <Text style={s.progressLabel}>
            {status?.active ? `${processed} of ${total} sync steps` : `${pendingCount} queued · ${failedCount} failed`}
          </Text>
          <View style={s.track}>
            <View style={[s.fill, { width: `${status?.active ? status.percent : failedCount ? 0 : 100}%` }]} />
          </View>
          <Text style={s.detail}>{status?.active ? `${status.percent}% complete` : 'Sync work does not block screens or local saves.'}</Text>
          {status?.lastSyncAt ? <Text style={s.detail}>Last sync: {fmtDateTime(status.lastSyncAt)}</Text> : null}
          {Number(status?.imageCacheFailures) > 0 ? (
            <Text style={s.warning}>{status.imageCacheFailures} product image(s) could not be cached. Check your connection and sync again.</Text>
          ) : null}
          {status?.syncError ? <Text style={s.warning}>{status.syncError}</Text> : null}
          <View style={s.actions}>
            {status?.active ? (
              <Btn title="Pause sync" icon="pause" variant="soft" onPress={pauseSync} disabled={busy} />
            ) : null}
            {failedCount > 0 ? (
              <Btn title={busy ? 'Retrying…' : 'Retry failed changes'} icon="refresh" onPress={() => runSync(true)} disabled={busy || status?.active || mode !== 'online'} />
            ) : (
              <Btn title={busy || status?.active ? 'Syncing…' : 'Sync now'} icon="sync" onPress={() => runSync()} disabled={busy || status?.active || mode !== 'online'} />
            )}
            <Btn title="Refresh status" icon="refresh-outline" variant="soft" onPress={reload} />
          </View>
        </Card>

        <Section title="Queued changes">
          <Card>
            {!status?.items?.length ? (
              <Text style={s.detail}>There are no unsynchronized changes.</Text>
            ) : status.items.map((item) => (
              <View key={item.id} style={s.item}>
                <View style={{ flex: 1 }}>
                  <Text style={s.itemTitle}>{item.type.replace(/\./g, ' ')}</Text>
                  <Text style={s.detail}>{fmtDateTime(item.created_at)}</Text>
                  {item.error ? <Text style={s.warning}>{item.error}</Text> : null}
                </View>
                <Pill label={item.status} tone={item.status === 'failed' ? 'danger' : 'warn'} />
              </View>
            ))}
          </Card>
        </Section>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 30 },
  body: { padding: 16 },
  heroText: { color: 'rgba(255,255,255,0.78)', marginTop: 8, fontSize: 13, lineHeight: 19 },
  title: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  detail: { color: colors.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressLabel: { color: colors.ink, fontSize: 13, marginTop: 12, marginBottom: 8 },
  track: { height: 8, backgroundColor: colors.line, borderRadius: 5, overflow: 'hidden' },
  fill: { height: 8, backgroundColor: colors.forest, borderRadius: 5 },
  warning: { color: colors.danger, fontSize: 12, lineHeight: 18, marginTop: 8 },
  actions: { gap: 10, marginTop: 16 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomColor: colors.line, borderBottomWidth: StyleSheet.hairlineWidth },
  itemTitle: { color: colors.ink, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
});
