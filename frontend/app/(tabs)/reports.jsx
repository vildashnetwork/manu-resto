import React, { useState } from 'react';
import { ScrollView, View, Text, Alert, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Hero, Card, Btn, Chip, Field, Sheet, Row, Section, Segmented, Stat, IconDot, Pill, Money, Empty,
  LoadError, useLoad, ScreenShimmer, ScreenRefreshControl, screenStyle, body,
} from '../../src/components/ui';
import DateRangeSheet, { PRESETS, presetFor, rangeLabel, dayEnd } from '../../src/components/DateRangeSheet';
import { getReport, getRecentSales, addExpense, cancelSale, updateSalePayment } from '../../src/api/repo';
import { fcfa, num, parseAmount, fmtDateTime } from '../../src/utils';
import { colors, radius, METHODS, METHOD_ICONS, METHOD_COLORS, EXPENSE_CATEGORIES } from '../../src/theme';

const QUICK = ['Today', 'Yesterday', '7 days', '30 days', 'This month', 'Last month'];

function FlowRow({ label, value, sign, color, bold, icon }) {
  return (
    <View style={s.flow}>
      {icon ? <IconDot name={icon} size={30} color={color} bg={color + '1F'} /> : null}
      <Text style={[s.flowLabel, bold && { color: colors.ink, fontWeight: '800' }]}>{label}</Text>
      <Text style={[s.flowVal, { color: color || colors.ink }, bold && { fontSize: 17 }]}>{sign}{num(value)}</Text>
    </View>
  );
}

function Mini({ label, value }) {
  return (
    <View style={s.mini}>
      <Text style={s.miniLabel}>{label}</Text>
      <Money value={value} size={15} color="#fff" />
    </View>
  );
}

export default function Reports() {
  const [range, setRange] = useState(() => { const [a, b] = PRESETS.Today(); return { from: a, to: b }; });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [d, reload, loading, error, refreshing] = useLoad(async () => {
    const from = range.from;
    const to = dayEnd(range.to);
    const [report, sales] = await Promise.all([getReport(from, to), getRecentSales(100, from, to)]);
    return { report, sales };
  }, { deps: [range.from, range.to], label: 'Reports' });

  const [expOpen, setExpOpen] = useState(false);
  const [expCat, setExpCat] = useState('Supplies');
  const [expMethod, setExpMethod] = useState('Cash');
  const [expAmt, setExpAmt] = useState('');
  const [expNote, setExpNote] = useState('');
  const [cancelId, setCancelId] = useState(null);
  const [reason, setReason] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('All');
  const [editingSale, setEditingSale] = useState(null);
  const [paidInput, setPaidInput] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [busy, setBusy] = useState(false);

  const activeKey = presetFor(range.from, range.to);

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

  async function saveSalePayment() {
    if (!editingSale || busy) return;
    const paidAmount = parseAmount(paidInput);
    if (paidAmount > editingSale.total) {
      Alert.alert('Invalid amount', 'The paid amount cannot be greater than the sale total.');
      return;
    }
    setBusy(true);
    try {
      await updateSalePayment(editingSale.id, { paidAmount, method: paymentMethod, idempotencyKey: `report-edit-${editingSale.id}-${Date.now()}` });
      setEditingSale(null);
      reload();
    } catch (e) {
      Alert.alert('Cannot update sale payment', e.message);
    } finally { setBusy(false); }
  }

  const quick = (key) => { const [a, b] = PRESETS[key](); setRange({ from: a, to: b }); };

  const r = d?.report;
  const visibleSales = (d?.sales ?? []).filter((x) =>
    paymentFilter === 'All' ||
    (x.status === 'completed' && (paymentFilter === 'Paid' ? x.credit_amount === 0 : x.credit_amount > 0))
  );
  const maxMethod = Math.max(1, ...(r?.byMethod ?? []).map((m) => m.sales + m.repayments));
  const maxProduct = Math.max(1, ...(r?.topProducts ?? []).map((p) => p.qty));
  const paidShare = r && r.totalSales > 0 ? Math.round(((r.totalSales - r.creditSales) / r.totalSales) * 100) : 0;

  if (loading && !d) return <ScreenShimmer variant="reports" />;
  if (!d && error) return <LoadError error={error} onRetry={() => reload()} />;
  if (!d) return <LoadError error={new Error('Report data is not available yet. Try loading again.')} onRetry={() => reload()} />;

  return (
    <ScrollView
      style={screenStyle}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      refreshControl={<ScreenRefreshControl refreshing={refreshing} onRefresh={() => reload()} />}
    >
      <Hero eyebrow="Business summary" title="Reports">
        <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [s.rangeBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Ionicons name="calendar" size={18} color={colors.gold} />
          <Text style={s.rangeText} numberOfLines={1}>{rangeLabel(range.from, range.to)}</Text>
          <Text style={s.rangeChange}>Change</Text>
          <Ionicons name="chevron-down" size={16} color="#fff" />
        </Pressable>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginHorizontal: -18 }} contentContainerStyle={{ paddingHorizontal: 18 }}>
          {QUICK.map((k) => (
            <Pressable key={k} onPress={() => quick(k)} style={[s.qChip, activeKey === k && s.qChipActive]}>
              <Text style={[s.qText, activeKey === k && { color: colors.forestDark }]}>{k}</Text>
            </Pressable>
          ))}
          <Pressable onPress={() => setPickerOpen(true)} style={[s.qChip, !activeKey && s.qChipActive]}>
            <Ionicons name="options-outline" size={14} color={!activeKey ? colors.forestDark : '#fff'} style={{ marginRight: 5 }} />
            <Text style={[s.qText, !activeKey && { color: colors.forestDark }]}>Custom</Text>
          </Pressable>
        </ScrollView>

        {r ? (
          <>
            <Text style={s.heroLabel}>Total sales · {r.salesCount} {r.salesCount === 1 ? 'sale' : 'sales'}</Text>
            <Money value={r.totalSales} size={38} color="#fff" style={{ marginTop: 2 }} />
            <View style={s.miniRow}>
              <Mini label="Collected" value={r.cashFromSales} />
              <Mini label="On credit" value={r.creditSales} />
              <Mini label="Expenses" value={r.expenses} />
            </View>
          </>
        ) : null}
      </Hero>

      {!r ? <View style={{ height: 200 }} /> : (
        <View style={body}>
          <Card>
            <Text style={s.cap}>How sales were paid</Text>
            <View style={s.split}>
              {r.totalSales > 0 ? (
                <>
                  <View style={[s.splitPaid, { flex: Math.max(paidShare, 0.0001) }]} />
                  <View style={[s.splitCredit, { flex: Math.max(100 - paidShare, 0.0001) }]} />
                </>
              ) : null}
            </View>
            <View style={s.legend}>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.ok }]} /><Text style={s.legendText}>Paid now {paidShare}%</Text></View>
              <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.warn }]} /><Text style={s.legendText}>On credit {r.totalSales > 0 ? 100 - paidShare : 0}%</Text></View>
            </View>
          </Card>

          <Card style={{ marginTop: 14 }}>
            <Text style={s.cap}>Cash flow · FCFA</Text>
            <FlowRow icon="arrow-down" label="Collected from these sales" value={r.cashFromSales} sign="+" color={colors.ok} />
            <FlowRow icon="refresh" label="Debt recovered (old credit)" value={r.debtRecovered} sign="+" color={colors.ok} />
            <FlowRow icon="arrow-up" label="Expenses paid" value={r.expenses} sign="−" color={colors.danger} />
            <View style={s.flowDivider} />
            <View style={s.netRow}>
              <Text style={s.netLabel}>Net cash movement</Text>
              <Text style={[s.netVal, { color: r.netCashMovement < 0 ? colors.danger : colors.forest }]}>{r.netCashMovement < 0 ? '−' : ''}{num(Math.abs(r.netCashMovement))}</Text>
            </View>
            <Text style={s.fine}>Cash movement is not profit. Opening cash and withdrawals are not included.</Text>
          </Card>

          <View style={s.grid}>
            <Stat icon="trending-up-outline" label="Gross profit (est.)" value={r.grossProfitEstimate} tone={colors.ok} />
            <Stat icon="alert-circle-outline" label={`Owed to you · ${r.debtorCount}`} value={r.outstandingDebt} tone={colors.danger} />
          </View>

          <Section title="By payment method">
            <Card>
              {r.byMethod.length === 0 && <Empty icon="wallet-outline" title="No payments in this period" />}
              {r.byMethod.map((m) => {
                const t = m.sales + m.repayments;
                const c = METHOD_COLORS[m.method] || colors.forest;
                return (
                  <View key={m.method} style={{ marginBottom: 16 }}>
                    <View style={s.methodHead}>
                      <IconDot name={METHOD_ICONS[m.method] || 'wallet-outline'} size={32} color={c} bg={c + '22'} />
                      <Text style={s.methodName}>{m.method}</Text>
                      <Text style={s.methodTotal}>{fcfa(t)}</Text>
                    </View>
                    <View style={s.track}><View style={[s.fill, { width: `${(t / maxMethod) * 100}%`, backgroundColor: c }]} /></View>
                    <Text style={s.methodSub}>Sales {fcfa(m.sales)} · Repayments {fcfa(m.repayments)}</Text>
                  </View>
                );
              })}
              <View style={s.note}>
                <Ionicons name="information-circle-outline" size={18} color={colors.forestMid} />
                <Text style={s.noteText}>
                  Expected cash from movements: <Text style={{ color: colors.ink, fontWeight: '800' }}>{fcfa(r.expectedCash)}</Text>. Add opening cash, then compare with the cash counted.
                </Text>
              </View>
            </Card>
          </Section>

          <Section title="Best sellers">
            <Card>
              {r.topProducts.length === 0 && <Empty icon="podium-outline" title="No sales in this period" />}
              {r.topProducts.map((p, i) => (
                <View key={p.name} style={{ marginBottom: i === r.topProducts.length - 1 ? 0 : 16 }}>
                  <View style={s.methodHead}>
                    <View style={s.rank}><Text style={s.rankText}>{i + 1}</Text></View>
                    <Text style={s.methodName} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.methodTotal}>{p.qty} sold</Text>
                  </View>
                  <View style={s.track}><View style={[s.fill, { width: `${(p.qty / maxProduct) * 100}%`, backgroundColor: colors.gold }]} /></View>
                  <Text style={s.methodSub}>{fcfa(p.revenue)}</Text>
                </View>
              ))}
            </Card>
          </Section>

          <Section title="Expenses" action="+ Add expense" onAction={() => setExpOpen(true)}>
            <Card style={{ paddingVertical: 4 }}>
              {r.expList.length === 0 && <Empty icon="receipt-outline" title="No expenses in this period" />}
              {r.expList.map((e, i) => (
                <Row
                  key={e.id}
                  last={i === r.expList.length - 1}
                  leading={<IconDot name="arrow-up" color={colors.danger} bg={colors.dangerTint} />}
                  left={e.category}
                  sub={`${fmtDateTime(e.created_at)} · ${e.method}${e.note ? ' · ' + e.note : ''}`}
                  right={`−${fcfa(e.amount)}`}
                  rightColor={colors.danger}
                />
              ))}
            </Card>
          </Section>

          <Section title="Sales history">
            <View style={{ marginBottom: 12 }}>
              <Segmented options={['All', 'Paid', 'Unpaid']} value={paymentFilter} onChange={setPaymentFilter} />
            </View>
            {visibleSales.length === 0 && <Card><Empty icon="cart-outline" title="No sales match these filters" /></Card>}
            {visibleSales.map((x) => {
              const cancelled = x.status === 'cancelled';
              return (
                <Card key={x.id} style={{ marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.saleNo}>{x.receipt_no}</Text>
                      <Text style={s.saleSub}>{fmtDateTime(x.created_at)}{x.customer_name ? ` · ${x.customer_name}` : ' · Walk-in'}</Text>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text style={[s.saleTotal, cancelled && { color: colors.muted, textDecorationLine: 'line-through' }]}>{fcfa(x.total)}</Text>
                      <View style={{ marginTop: 4 }}>
                        <Pill label={cancelled ? 'Cancelled' : x.credit_amount > 0 ? `Unpaid ${num(x.credit_amount)}` : 'Paid'} tone={cancelled ? 'neutral' : x.credit_amount > 0 ? 'warn' : 'ok'} />
                      </View>
                    </View>
                  </View>
                  {x.cancel_reason ? <Text style={[s.saleSub, { marginTop: 6 }]}>Reason: {x.cancel_reason}</Text> : null}
                  {!cancelled && (
                    <View style={s.saleActions}>
                      <Btn small variant="soft" icon="create-outline" title="Edit paid" style={{ flex: 1 }}
                        onPress={() => { setEditingSale(x); setPaidInput(String(x.paid_amount || 0)); setPaymentMethod('Cash'); }} />
                      <Btn small variant="dangerSoft" icon="close-circle-outline" title="Cancel" style={{ flex: 1 }} onPress={() => setCancelId(x.id)} />
                    </View>
                  )}
                </Card>
              );
            })}
          </Section>
        </View>
      )}

      <DateRangeSheet
        visible={pickerOpen}
        from={range.from}
        to={range.to}
        onClose={() => setPickerOpen(false)}
        onApply={(a, b) => { setRange({ from: a, to: b }); setPickerOpen(false); }}
      />

      <Sheet visible={!!editingSale} title="Edit amount paid" onClose={() => setEditingSale(null)}>
        <Card style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.muted, fontWeight: '600' }}>{editingSale?.receipt_no}</Text>
          <Money value={editingSale?.total} size={26} />
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Sale total</Text>
        </Card>
        <Field label="Amount paid (FCFA)" keyboardType="number-pad" value={paidInput} onChangeText={setPaidInput} inputStyle={{ fontSize: 22, fontWeight: '800', minHeight: 58 }} />
        {parseAmount(paidInput) < (editingSale?.total || 0) && (
          <Text style={{ color: colors.warn, fontWeight: '700', marginBottom: 14 }}>
            Remaining credit: {fcfa((editingSale?.total || 0) - parseAmount(paidInput))}
          </Text>
        )}
        <Text style={s.cap}>Payment method for the corrected amount</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 14 }}>
          {METHODS.map((m) => <Chip key={m} icon={METHOD_ICONS[m]} label={m} active={paymentMethod === m} onPress={() => setPaymentMethod(m)} />)}
        </View>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>
          The previous payment entries are kept and marked reversed, then the corrected amount is recorded. The change is written to the audit log.
        </Text>
        <Btn icon="checkmark-circle" title={busy ? 'Saving…' : 'Save payment adjustment'} onPress={saveSalePayment} disabled={busy || parseAmount(paidInput) > (editingSale?.total || 0)} />
      </Sheet>

      <Sheet visible={expOpen} title="New expense" onClose={() => setExpOpen(false)}>
        <Text style={s.cap}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 14 }}>
          {EXPENSE_CATEGORIES.map((c) => <Chip key={c} label={c} active={expCat === c} onPress={() => setExpCat(c)} />)}
        </View>
        <Field label="Amount (FCFA)" keyboardType="number-pad" value={expAmt} onChangeText={setExpAmt} inputStyle={{ fontSize: 22, fontWeight: '800', minHeight: 58 }} />
        <Text style={s.cap}>Paid with</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 14 }}>
          {METHODS.map((m) => <Chip key={m} icon={METHOD_ICONS[m]} label={m} active={expMethod === m} onPress={() => setExpMethod(m)} />)}
        </View>
        <Field label="Note" value={expNote} onChangeText={setExpNote} />
        <Btn icon="checkmark" title={busy ? 'Saving…' : 'Save expense'} onPress={saveExpense} disabled={busy || parseAmount(expAmt) <= 0} />
      </Sheet>

      <Sheet visible={!!cancelId} title="Cancel sale" onClose={() => setCancelId(null)}>
        <Text style={{ color: colors.muted, marginBottom: 14, lineHeight: 20 }}>
          The sale stays on record as cancelled. Stock is restored and any credit is reversed. A reason is required.
        </Text>
        <Field label="Reason" value={reason} onChangeText={setReason} />
        <Btn variant="danger" icon="close-circle" title={busy ? 'Cancelling…' : 'Confirm cancellation'} onPress={doCancel} disabled={busy || !reason.trim()} />
      </Sheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  rangeBtn: {
    flexDirection: 'row', alignItems: 'center', marginTop: 16, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)',
  },
  rangeText: { flex: 1, color: '#fff', fontWeight: '800', fontSize: 16, marginLeft: 10 },
  rangeChange: { color: colors.gold, fontWeight: '700', fontSize: 13, marginRight: 6 },
  qChip: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)', marginRight: 8,
  },
  qChipActive: { backgroundColor: colors.gold },
  qText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 22 },
  miniRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  mini: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, padding: 10 },
  miniLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 11, fontWeight: '600', marginBottom: 4 },

  cap: { fontSize: 12, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 12 },
  split: { flexDirection: 'row', height: 14, borderRadius: 7, overflow: 'hidden', backgroundColor: '#EFEBE0' },
  splitPaid: { backgroundColor: colors.ok },
  splitCredit: { backgroundColor: colors.warn },
  legend: { flexDirection: 'row', gap: 18, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendText: { fontSize: 13, fontWeight: '600', color: colors.ink },

  flow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  flowLabel: { flex: 1, marginLeft: 10, color: colors.muted, fontWeight: '600', fontSize: 14 },
  flowVal: { fontWeight: '800', fontSize: 15 },
  flowDivider: { height: 1, backgroundColor: colors.line, marginVertical: 8 },
  netRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  netLabel: { fontSize: 15, fontWeight: '800', color: colors.ink },
  netVal: { fontSize: 24, fontWeight: '900', letterSpacing: -0.5 },
  fine: { fontSize: 11, color: colors.muted, marginTop: 8 },
  grid: { flexDirection: 'row', gap: 10, marginTop: 14 },

  methodHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  methodName: { flex: 1, marginLeft: 10, fontWeight: '700', color: colors.ink, fontSize: 14 },
  methodTotal: { fontWeight: '800', color: colors.ink, fontSize: 14 },
  methodSub: { fontSize: 12, color: colors.muted, marginTop: 6 },
  track: { height: 8, borderRadius: 4, backgroundColor: '#EFEBE0', overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  note: { flexDirection: 'row', backgroundColor: colors.forestTint, borderRadius: 12, padding: 12, marginTop: 4 },
  noteText: { flex: 1, marginLeft: 8, color: colors.muted, fontSize: 12, lineHeight: 18 },
  rank: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontWeight: '900', color: '#8A6A1E', fontSize: 13 },
  saleNo: { fontSize: 15, fontWeight: '800', color: colors.ink },
  saleSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  saleTotal: { fontSize: 16, fontWeight: '800', color: colors.ink },
  saleActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
});