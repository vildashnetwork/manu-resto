import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Btn, Card, Hero, screenStyle } from '../src/components/ui';
import { getSyncQueue } from '../src/db/repo';
import { readSyncProgress, syncAll } from '../src/db/sync';
import { colors, radius } from '../src/theme';
import { fmtDateTime } from '../src/utils';

export default function SyncScreen() {
  const { start } = useLocalSearchParams();
  const [progress, setProgress] = useState(null);
  const [queue, setQueue] = useState([]);
  const [running, setRunning] = useState(false);

  async function refresh() {
    try {
      const [current, pending] = await Promise.all([readSyncProgress(), getSyncQueue()]);
      setProgress(current);
      setQueue(pending);
      setRunning(current.status === 'syncing');
    } catch (error) {
      Alert.alert('Could not read sync status', error.message || String(error));
    }
  }

  useEffect(() => {
    let active = true;
    const poll = async () => {
      if (!active) return;
      try {
        const [current, pending] = await Promise.all([readSyncProgress(), getSyncQueue()]);
        if (!active) return;
        setProgress(current);
        setQueue(pending);
        setRunning(current.status === 'syncing');
      } catch (error) {
        if (active) Alert.alert('Could not read sync status', error.message || String(error));
      }
    };
    void poll();
    const timer = setInterval(poll, 800);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (start !== '1') return;
    void startSync();
  }, [start]);

  async function startSync() {
    setRunning(true);
    try {
      await syncAll(setProgress);
      await refresh();
    } catch (error) {
      Alert.alert('Sync could not complete', error.message || String(error));
    } finally {
      setRunning(false);
    }
  }

  const percent = Math.max(0, Math.min(100, Number(progress?.percent || 0)));
  const syncing = running || progress?.status === 'syncing';

  return (
    <ScrollView style={screenStyle} contentContainerStyle={s.content}>
      <Hero eyebrow="Device data" title="Sync progress">
        <Text style={s.heroText}>Sync your local changes and download a fresh copy for offline use.</Text>
      </Hero>

      <View style={s.body}>
        <Card>
          <View style={s.progressHead}>
            <Text style={s.progressLabel}>{syncing ? 'Syncing' : progress?.status === 'complete' ? 'Up to date' : progress?.status === 'error' ? 'Needs attention' : 'Ready to sync'}</Text>
            <Text style={s.percent}>{percent}%</Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 0, max: 100, now: percent }}
            style={s.track}
          >
            <View style={[s.fill, { width: `${percent}%` }]} />
          </View>
          <Text style={s.stage}>{progress?.stage || 'No sync has been run on this device yet.'}</Text>
          <View style={s.stats}>
            <Text style={s.stat}>{progress?.counts?.done || 0} synced</Text>
            <Text style={s.stat}>{progress?.counts?.pending || 0} pending</Text>
            <Text style={[s.stat, (progress?.counts?.errors || 0) > 0 && { color: colors.danger }]}>
              {progress?.counts?.errors || 0} failed
            </Text>
          </View>
          {progress?.lastSyncedAt ? <Text style={s.lastSynced}>Last download: {fmtDateTime(progress.lastSyncedAt)}</Text> : null}
        </Card>

        <Btn
          title={syncing ? 'Syncing…' : progress?.status === 'error' ? 'Retry sync' : 'Sync now'}
          icon="sync-outline"
          onPress={startSync}
          disabled={syncing}
          style={{ marginTop: 14 }}
        />

        <View style={{ marginTop: 20 }}>
          <Text style={s.sectionTitle}>Pending and failed items</Text>
          {queue.length === 0 ? (
            <Card style={s.empty}>
              <Ionicons name="checkmark-circle-outline" size={30} color={colors.ok} />
              <Text style={s.emptyText}>No local changes are waiting to sync.</Text>
            </Card>
          ) : queue.map((item) => (
            <Card key={item.id} style={s.queueItem}>
              <View style={s.queueTitleRow}>
                <Text style={s.queueTitle}>{item.entity.replace('_', ' ')} · {item.op}</Text>
                <Text style={[s.queueStatus, item.status === 'error' && { color: colors.danger }]}>
                  {item.status === 'error' ? 'Failed' : item.status === 'syncing' ? 'In progress' : 'Waiting'}
                </Text>
              </View>
              {item.error ? <Text style={s.error}>{item.error}</Text> : null}
              <Text style={s.queueDate}>{fmtDateTime(item.created_at)}</Text>
            </Card>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { paddingBottom: 32 },
  body: { padding: 16 },
  heroText: { color: 'rgba(255,255,255,0.78)', fontSize: 13, lineHeight: 19, marginTop: 7 },
  progressHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  progressLabel: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  percent: { color: colors.forest, fontSize: 24, fontWeight: '900' },
  track: { height: 12, backgroundColor: colors.cream, borderRadius: 8, overflow: 'hidden', marginTop: 14 },
  fill: { height: '100%', backgroundColor: colors.forest, borderRadius: 8 },
  stage: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 12 },
  stats: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, paddingTop: 13, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line },
  stat: { color: colors.muted, fontSize: 12, fontWeight: '700' },
  lastSynced: { color: colors.faint, fontSize: 11, marginTop: 12 },
  sectionTitle: { color: colors.ink, fontSize: 15, fontWeight: '800', marginBottom: 10 },
  empty: { alignItems: 'center', gap: 8 },
  emptyText: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  queueItem: { marginBottom: 9 },
  queueTitleRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  queueTitle: { flex: 1, color: colors.ink, fontSize: 13, fontWeight: '700', textTransform: 'capitalize' },
  queueStatus: { color: colors.warn, fontSize: 11, fontWeight: '800' },
  error: { color: colors.danger, fontSize: 12, lineHeight: 17, marginTop: 7 },
  queueDate: { color: colors.faint, fontSize: 10, marginTop: 8 },
});
