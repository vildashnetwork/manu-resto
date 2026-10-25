import React from 'react';
import { ScrollView, View, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Btn, Stat, Row, Section, useLoad, screenStyle, pad } from '../../src/components/ui';
import { getReport, getRecentSales, getProducts } from '../../src/api/repo';
import { fcfa, startOfDay, fmtDateTime } from '../../src/utils';
import { colors } from '../../src/theme';

export default function Home() {
  const router = useRouter();
  const [d, reload] = useLoad(async () => {
    const from = startOfDay();
    const to = Date.now();
    const [report, recent, products] = await Promise.all([getReport(from, to), getRecentSales(5, from, to), getProducts()]);
    const low = products.filter((p) => p.tracked && p.low_stock_threshold > 0 && p.stock <= p.low_stock_threshold);
    return { report, recent, low };
  });

  if (!d) return <View style={screenStyle} />;
  const { report: r, recent, low } = d;

  return (
    <ScrollView style={screenStyle} contentContainerStyle={pad}>
      <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 8 }}>Today</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label="Total sales" value={fcfa(r.totalSales)} />
        <Stat label="Collected from sales" value={fcfa(r.cashFromSales)} tone={colors.ok} />
        <Stat label="Credit sales" value={fcfa(r.creditSales)} tone={colors.warn} />
        <Stat label="Debt recovered" value={fcfa(r.debtRecovered)} tone={colors.ok} />
        <Stat label="Expenses" value={fcfa(r.expenses)} tone={colors.danger} />
        <Stat label="Outstanding debt" value={fcfa(r.outstandingDebt)} tone={colors.danger} />
      </View>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
        <Btn title="New sale" onPress={() => router.push('/sales')} style={{ flex: 1 }} />
        <Btn title="Repayment" variant="ghost" onPress={() => router.push('/customers')} style={{ flex: 1 }} />
      </View>

      {low.length > 0 && (
        <Card style={{ marginTop: 16, borderColor: colors.warn }}>
          <Text style={{ fontWeight: '700', color: colors.warn }}>Low stock ({low.length})</Text>
          <Text style={{ color: colors.muted, marginTop: 4 }}>{low.map((p) => `${p.name} (${p.stock})`).join(', ')}</Text>
        </Card>
      )}

      <Section title="Recent sales">
        <Card>
          {recent.length === 0 ? (
            <Text style={{ color: colors.muted }}>No sales yet today.</Text>
          ) : (
            recent.map((s) => (
              <Row
                key={s.id}
                left={s.receipt_no}
                sub={`${fmtDateTime(s.created_at)}${s.customer_name ? ' · ' + s.customer_name : ''}${s.status === 'cancelled' ? ' · CANCELLED' : ''}`}
                right={fcfa(s.total)}
                rightColor={s.status === 'cancelled' ? colors.muted : undefined}
                subRight={s.credit_amount > 0 ? `Credit ${fcfa(s.credit_amount)}` : 'Paid'}
              />
            ))
          )}
        </Card>
      </Section>
    </ScrollView>
  );
}
