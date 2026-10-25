import React, { useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { Card, Btn, Chip, Field, Sheet, Row, Section, Stat, useLoad, screenStyle, pad } from '../../src/components/ui';
import { getReport, getRecentSales, addExpense, cancelSale } from '../../src/api/repo';
import { fcfa, parseAmount, startOfDay, startOfMonth, fmtDateTime } from '../../src/utils';
import { colors, METHODS, EXPENSE_CATEGORIES } from '../../src/theme';

const DAY = 86400000;
const PERIODS = {
  Today: () => [startOfDay(), Date.now()],
  '7 days': () => [startOfDay() - 6 * DAY, Date.now()],
  'This month': () => [startOfMonth(), Date.now()],
};

export default function Reports() {
  const [period, setPeriod] = useState('Today');
  const [d, reload] = useLoad(async () => {
    const [from, to] = PERIODS[period]();
    const [report, sales] = await Promise.all([getReport(from, to), getRecentSales(30, from, to)]);
    return { report, sales };
  }, [period]);

  const [expOpen, setExpOpen] = useState(false);
  const [expCat, setExpCat] = useState('Supplies');
  const [expMethod, setExpMethod] = useState('Cash');
  const [expAmt, setExpAmt] = useState('');
  const [expNote, setExpNote] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function saveExpense() {
    if (busy) return;
    setBusy(true);
    try {
      await addExpense({ category: expCat, amount: parseAmount(expAmt), method: expMethod, note: expNote });
      setExpAmt(''); setExpNote(''); setExpOpen(false); reload();
    } catch (e) { Alert.alert('Cannot save expense', e.message); } finally { setBusy(false); }
  }

  async function doCancel() {
    if (busy) return;
    setBusy(true);
    try {
      await cancelSale(cancelId, reason);
      setCancelId(null); setReason(''); reload();
    } catch (e) { Alert.alert('Cannot cancel sale', e.message); } finally { setBusy(false); }
  }

  if (!d) return <View style={screenStyle} />;
  const r = d.report;

  return (
    <ScrollView style={screenStyle} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        {Object.keys(PERIODS).map((p) => <Chip key={p} label={p} active={period === p} onPress={() => setPeriod(p)} />)}
      </View>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        <Stat label={`Total sales (${r.salesCount})`} value={fcfa(r.totalSales)} />
        <Stat label="Collected from these sales" value={fcfa(r.cashFromSales)} tone={colors.ok} />
        <Stat label="Credit sales" value={fcfa(r.creditSales)} tone={colors.warn} />
        <Stat label="Debt recovered" value={fcfa(r.debtRecovered)} tone={colors.ok} />
        <Stat label="Expenses" value={fcfa(r.expenses)} tone={colors.danger} />
        <Stat label="Net cash movement" value={fcfa(r.netCashMovement)} />
        <Stat label="Gross profit estimate" value={fcfa(r.grossProfitEstimate)} />
        <Stat label={`Outstanding debt (${r.debtorCount})`} value={fcfa(r.outstandingDebt)} tone={colors.danger} />
      </View>

      <Section title="By payment method">
        <Card>
          {r.byMethod.length === 0 && <Text style={{ color: colors.muted }}>No payments in this period.</Text>}
          {r.byMethod.map((m) => (
            <Row key={m.method} left={m.method} sub={`Sales ${fcfa(m.sales)} · Repayments ${fcfa(m.repayments)}`} right={fcfa(m.sales + m.repayments)} />
          ))}
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>
            Expected cash from movements (cash in − cash expenses): <Text style={{ fontWeight: '700', color: colors.ink }}>{fcfa(r.expectedCash)}</Text>. Add opening cash, then compare with the cash counted.
          </Text>
        </Card>
      </Section>

      <Section title="Best sellers">
        <Card>
          {r.topProducts.length === 0 && <Text style={{ color: colors.muted }}>No sales in this period.</Text>}
          {r.topProducts.map((p) => <Row key={p.name} left={p.name} sub={`${p.qty} sold`} right={fcfa(p.revenue)} />)}
        </Card>
      </Section>

      <Section title="Expenses">
        <Btn title="Add expense" variant="ghost" onPress={() => setExpOpen(true)} style={{ marginBottom: 8 }} />
        <Card>
          {r.expList.length === 0 && <Text style={{ color: colors.muted }}>No expenses in this period.</Text>}
          {r.expList.map((e) => (
            <Row key={e.id} left={e.category} sub={`${fmtDateTime(e.created_at)} · ${e.method}${e.note ? ' · ' + e.note : ''}`} right={fcfa(e.amount)} rightColor={colors.danger} />
          ))}
        </Card>
      </Section>

      <Section title="Sales history">
        <Card>
          {d.sales.length === 0 && <Text style={{ color: colors.muted }}>No sales in this period.</Text>}
          {d.sales.map((s) => (
            <View key={s.id}>
              <Row
                left={`${s.receipt_no}${s.status === 'cancelled' ? ' (cancelled)' : ''}`}
                sub={`${fmtDateTime(s.created_at)}${s.customer_name ? ' · ' + s.customer_name : ''}${s.cancel_reason ? ' · ' + s.cancel_reason : ''}`}
                right={fcfa(s.total)}
                rightColor={s.status === 'cancelled' ? colors.muted : undefined}
                subRight={s.credit_amount > 0 ? `Credit ${fcfa(s.credit_amount)}` : 'Paid'}
              />
              {s.status === 'completed' && (
                <Btn title="Cancel sale" variant="ghost" onPress={() => setCancelId(s.id)} style={{ minHeight: 34, marginVertical: 6, alignSelf: 'flex-start' }} />
              )}
            </View>
          ))}
        </Card>
      </Section>

      <Sheet visible={expOpen} title="New expense" onClose={() => setExpOpen(false)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, rowGap: 8 }}>
          {EXPENSE_CATEGORIES.map((c) => <Chip key={c} label={c} active={expCat === c} onPress={() => setExpCat(c)} />)}
        </View>
        <Field label="Amount (FCFA)" keyboardType="number-pad" value={expAmt} onChangeText={setExpAmt} />
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Paid with</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, rowGap: 8 }}>
          {METHODS.map((m) => <Chip key={m} label={m} active={expMethod === m} onPress={() => setExpMethod(m)} />)}
        </View>
        <Field label="Note" value={expNote} onChangeText={setExpNote} />
        <Btn title={busy ? 'Saving…' : 'Save expense'} onPress={saveExpense} disabled={busy || parseAmount(expAmt) <= 0} />
      </Sheet>

      <Sheet visible={!!cancelId} title="Cancel sale" onClose={() => setCancelId(null)}>
        <Text style={{ color: colors.muted, marginBottom: 10 }}>The sale stays on record as cancelled. Stock is restored and any credit is reversed. A reason is required.</Text>
        <Field label="Reason" value={reason} onChangeText={setReason} />
        <Btn title={busy ? 'Cancelling…' : 'Confirm cancellation'} variant="danger" onPress={doCancel} disabled={busy || !reason.trim()} />
      </Sheet>
    </ScrollView>
  );
}
