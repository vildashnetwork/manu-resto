import React from 'react';
import { ScrollView, View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Hero, Card, Money, Pill, Row, Section, Empty, IconDot, LoadError, useLoad, ScreenShimmer, ScreenRefreshControl, screenStyle, body } from '../../src/components/ui';
import { getReport, getRecentSales, getProducts } from '../../src/api/repo';
import { fcfa, startOfDay, fmtDateTime } from '../../src/utils';
import { colors, radius, shadow } from '../../src/theme';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

function Action({ icon, label, onPress, primary }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.action, primary && s.actionPrimary, { opacity: pressed ? 0.85 : 1 }]}>
      <Ionicons name={icon} size={24} color={primary ? colors.forestDark : colors.forest} />
      <Text style={[s.actionText, primary && { color: colors.forestDark }]}>{label}</Text>
    </Pressable>
  );
}

function Mini({ label, value }) {
  return (
    <View style={s.mini}>
      <Text style={s.miniLabel}>{label}</Text>
      <Money value={value} size={16} color="#fff" />
    </View>
  );
}

export default function Home() {
  const router = useRouter();
  const [d, reload, loading, error, refreshing] = useLoad(async () => {
    const from = startOfDay();
    const to = Date.now();
    const [report, recent, products] = await Promise.all([getReport(from, to), getRecentSales(6, from, to), getProducts()]);
    const low = products.filter((p) => p.tracked && p.low_stock_threshold > 0 && p.stock <= p.low_stock_threshold);
    return { report, recent, low };
  }, { label: 'Dashboard' });

  if (loading && !d) return <ScreenShimmer variant="dashboard" />;
  if (!d && error) return <LoadError error={error} onRetry={() => reload()} />;
  if (!d) return <LoadError error={new Error('Dashboard data is not available yet. Try loading again.')} onRetry={() => reload()} />;
  const { report: r, recent, low } = d;

  return (
    <ScrollView
      style={screenStyle}
      showsVerticalScrollIndicator={false}
      refreshControl={<ScreenRefreshControl refreshing={refreshing} onRefresh={() => reload()} />}
    >
      <Hero eyebrow={`${greeting()} 👋`} title="Manu's Resto">
        <Text style={s.heroLabel}>Today's sales · {r.salesCount} {r.salesCount === 1 ? 'sale' : 'sales'}</Text>
        <Money value={r.totalSales} size={40} color="#fff" style={{ marginTop: 2 }} />
        <View style={s.miniRow}>
          <Mini label="Collected" value={r.cashFromSales} />
          <Mini label="On credit" value={r.creditSales} />
          <Mini label="Debt recovered" value={r.debtRecovered} />
        </View>
      </Hero>

      <View style={body}>
        <View style={s.actions}>
          <Action primary icon="add-circle" label="New sale" onPress={() => router.push('/sales')} />
          <Action icon="cash" label="Repayment" onPress={() => router.push('/customers')} />
          <Action icon="receipt" label="Expense" onPress={() => router.push('/reports')} />
          <Action icon="cube" label="Stock" onPress={() => router.push('/stock')} />
        </View>

        <Pressable onPress={() => router.push('/customers')} style={{ marginTop: 18 }}>
          <Card style={s.debtCard}>
            <IconDot name="alert-circle" color={colors.danger} bg={colors.dangerTint} size={46} />
            <View style={{ flex: 1, marginLeft: 14 }}>
              <Text style={s.debtLabel}>Customers owe you</Text>
              <Money value={r.outstandingDebt} size={22} color={colors.danger} />
              <Text style={s.debtSub}>{r.debtorCount} {r.debtorCount === 1 ? 'customer' : 'customers'} with open balance</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.faint} />
          </Card>
        </Pressable>

        <Card style={[s.debtCard, { marginTop: 12 }]}>
          <IconDot name="arrow-up-circle" color={colors.warn} bg={colors.warnTint} size={46} />
          <View style={{ flex: 1, marginLeft: 14 }}>
            <Text style={s.debtLabel}>Spent today</Text>
            <Money value={r.expenses} size={22} color={colors.ink} />
          </View>
        </Card>

        {low.length > 0 && (
          <Pressable onPress={() => router.push('/stock')} style={{ marginTop: 12 }}>
            <Card style={[s.debtCard, { backgroundColor: colors.warnTint }]}>
              <IconDot name="warning" color={colors.warn} bg="#fff" size={46} />
              <View style={{ flex: 1, marginLeft: 14 }}>
                <Text style={[s.debtLabel, { color: colors.warn }]}>Low stock · {low.length}</Text>
                <Text style={{ color: colors.ink, fontWeight: '600', marginTop: 2 }} numberOfLines={2}>
                  {low.map((p) => `${p.name} (${p.stock})`).join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.warn} />
            </Card>
          </Pressable>
        )}

        <Section title="Recent sales" action="See all" onAction={() => router.push('/reports')}>
          <Card style={{ paddingVertical: 4 }}>
            {recent.length === 0 ? (
              <Empty icon="cart-outline" title="No sales yet today" hint="Tap New sale to record the first one." />
            ) : (
              recent.map((x, i) => (
                <Row
                  key={x.id}
                  last={i === recent.length - 1}
                  leading={<IconDot name={x.status === 'cancelled' ? 'close' : x.credit_amount > 0 ? 'time-outline' : 'checkmark'} color={x.status === 'cancelled' ? colors.muted : x.credit_amount > 0 ? colors.warn : colors.ok} bg={x.status === 'cancelled' ? '#EFEBE0' : x.credit_amount > 0 ? colors.warnTint : colors.okTint} />}
                  left={x.customer_name || 'Walk-in'}
                  sub={`${x.receipt_no} · ${fmtDateTime(x.created_at).slice(11)}${x.status === 'cancelled' ? ' · cancelled' : x.credit_amount > 0 ? ` · owes ${fcfa(x.credit_amount)}` : ''}`}
                  right={fcfa(x.total)}
                  rightColor={x.status === 'cancelled' ? colors.muted : undefined}
                />
              ))
            )}
          </Card>
        </Section>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 22 },
  miniRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  mini: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, padding: 10 },
  miniLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginBottom: 4 },
  actions: { flexDirection: 'row', gap: 10 },
  action: {
    flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 14, borderRadius: radius.lg,
    backgroundColor: '#fff', ...shadow,
  },
  actionPrimary: { backgroundColor: colors.gold },
  actionText: { marginTop: 6, fontSize: 12, fontWeight: '700', color: colors.forest },
  debtCard: { flexDirection: 'row', alignItems: 'center' },
  debtLabel: { fontSize: 12, fontWeight: '700', color: colors.muted, marginBottom: 2 },
  debtSub: { fontSize: 12, color: colors.muted, marginTop: 3 },
});