import React, { useState } from 'react';
import { ScrollView, View, Text, Alert, Pressable, StyleSheet, Keyboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  Hero, Card, Btn, Chip, Field, Row, Section, Segmented, Stat, IconDot, Pill, Money, Empty,
  useLoad, ScreenShimmer, screenStyle, body,
} from '../../src/components/ui';
import KeyboardSheet from '../../src/components/KeyboardSheet';
import DateRangeSheet, { PRESETS, presetFor, rangeLabel, dayEnd } from '../../src/components/DateRangeSheet';
import { getReport, getRecentSales, addExpense, cancelSale, updateSalePayment, getProducts, getCustomers, createSale } from '../../src/api/repo';
import { getReportLogoDataUri, buildSalesReportHtml, buildSaleReceiptHtml, savePdf, printHtml, safeFilePart } from '../../src/reports/salesReportPdf';
import { fcfa, num, parseAmount, fmtDateTime, uid } from '../../src/utils';
import { colors, radius, METHODS, METHOD_ICONS, METHOD_COLORS, EXPENSE_CATEGORIES } from '../../src/theme';

const QUICK = ['Today', 'Yesterday', '7 days', '30 days', 'This month', 'Last month'];
const PERIOD_TITLE = {
  Today: 'Daily sales report',
  Yesterday: 'Daily sales report',
  '7 days': 'Weekly sales report',
  '30 days': 'Monthly sales report',
  'This month': 'Monthly sales report',
  'Last month': 'Monthly sales report',
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

function pad2(value) {
  return String(value).padStart(2, '0');
}

function toDateInput(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function localDateInput(date = new Date()) {
  return toDateInput(date.getFullYear(), date.getMonth(), date.getDate());
}

function localDateTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date.getTime();
}

function prettyDate(value) {
  const ts = localDateTimestamp(value);
  if (ts === null) return 'Pick a date';
  const d = new Date(ts);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Simple month calendar. Future days are disabled because a sale cannot be recorded in the future.
function CalendarPicker({ value, onChange }) {
  const selectedTs = localDateTimestamp(value);
  const start = selectedTs !== null ? new Date(selectedTs) : new Date();
  const [view, setView] = useState({ y: start.getFullYear(), m: start.getMonth() });

  const now = new Date();
  const todayTs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nextDisabled = view.y > now.getFullYear() || (view.y === now.getFullYear() && view.m >= now.getMonth());

  const firstOffset = (new Date(view.y, view.m, 1).getDay() + 6) % 7; // week starts on Monday
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstOffset; i += 1) cells.push(null);
  for (let day = 1; day <= daysInMonth; day += 1) cells.push(day);
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  function shift(delta) {
    setView((current) => {
      const d = new Date(current.y, current.m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  return (
    <View style={s.cal}>
      <View style={s.calHead}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={s.calNav}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={s.calTitle}>{MONTHS[view.m]} {view.y}</Text>
        <Pressable onPress={() => shift(1)} disabled={nextDisabled} hitSlop={10} style={[s.calNav, nextDisabled && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>

      <View style={s.calRow}>
        {WEEKDAYS.map((w) => <Text key={w} style={s.calWeekday}>{w}</Text>)}
      </View>

      {weeks.map((week, wi) => (
        <View key={wi} style={s.calRow}>
          {week.map((day, di) => {
            if (day === null) return <View key={di} style={s.calCell} />;
            const ts = new Date(view.y, view.m, day).getTime();
            const disabled = ts > todayTs;
            const selected = ts === selectedTs;
            const isToday = ts === todayTs;
            return (
              <View key={di} style={s.calCell}>
                <Pressable
                  disabled={disabled}
                  onPress={() => onChange(toDateInput(view.y, view.m, day))}
                  style={({ pressed }) => [
                    s.calDay,
                    isToday && !selected && s.calDayToday,
                    selected && s.calDaySelected,
                    pressed && !selected && { backgroundColor: colors.goldTint },
                  ]}
                >
                  <Text style={[s.calDayText, disabled && s.calDayTextDisabled, selected && s.calDayTextSelected]}>{day}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export default function Reports() {
  const [range, setRange] = useState(() => { const [a, b] = PRESETS.Today(); return { from: a, to: b }; });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [d, reload, loading] = useLoad(async () => {
    const from = range.from;
    const to = dayEnd(range.to);
    const [report, sales] = await Promise.all([getReport(from, to), getRecentSales(100, from, to)]);
    return { report, sales };
  }, [range.from, range.to]);

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
  const [exporting, setExporting] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualLoading, setManualLoading] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualProducts, setManualProducts] = useState([]);
  const [manualCustomers, setManualCustomers] = useState([]);
  const [manualSearch, setManualSearch] = useState('');
  const [manualCustomerSearch, setManualCustomerSearch] = useState('');
  const [manualCategory, setManualCategory] = useState('All');
  const [manualCart, setManualCart] = useState({});
  const [manualCustomerId, setManualCustomerId] = useState('');
  const [manualPaid, setManualPaid] = useState('0');
  const [manualMethod, setManualMethod] = useState('Cash');
  const [manualDate, setManualDate] = useState(localDateInput());
  const [manualCalOpen, setManualCalOpen] = useState(false);
  const [receiptBusyId, setReceiptBusyId] = useState(null);

  const activeKey = presetFor(range.from, range.to);
  const periodTitle = PERIOD_TITLE[activeKey] || 'Sales report';

  async function exportReport(share = false) {
    const report = d?.report;
    if (!report || exporting) return;
    setExporting(true);
    try {
      const label = rangeLabel(range.from, range.to);
      // fetch the full list of sales for the period (the screen only loads the latest 100)
      const [logoUri, allSales] = await Promise.all([
        getReportLogoDataUri(),
        getRecentSales(2000, range.from, dayEnd(range.to)),
      ]);
      const html = buildSalesReportHtml({
        logoUri, title: periodTitle, periodLabel: label, report, sales: allSales,
      });
      const fileName = `${safeFilePart(`Manus Resto - ${periodTitle} - ${label}`, 'sales-report')}.pdf`;
      await savePdf({ html, fileName, share });
    } catch (e) {
      Alert.alert(share ? 'Cannot share report' : 'Cannot download report', e.message || String(e));
    } finally {
      setExporting(false);
    }
  }

  async function saveExpense() {
    if (busy) return;
    Keyboard.dismiss();
    setBusy(true);
    try {
      await addExpense({ category: expCat, amount: parseAmount(expAmt), method: expMethod, note: expNote });
      setExpAmt(''); setExpNote(''); setExpOpen(false); reload();
    } catch (e) { Alert.alert('Cannot save expense', e.message); } finally { setBusy(false); }
  }

  async function doCancel() {
    if (busy) return;
    Keyboard.dismiss();
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
    Keyboard.dismiss();
    setBusy(true);
    try {
      await updateSalePayment(editingSale.id, { paidAmount, method: paymentMethod, idempotencyKey: `report-edit-${editingSale.id}-${Date.now()}` });
      setEditingSale(null);
      reload();
    } catch (e) {
      Alert.alert('Cannot update sale payment', e.message);
    } finally { setBusy(false); }
  }

  async function openManualSale() {
    if (manualLoading) return;
    setManualLoading(true);
    try {
      const [products, customers] = await Promise.all([getProducts(), getCustomers()]);
      setManualProducts(products);
      setManualCustomers(customers);
      setManualDate(localDateInput());
      setManualCalOpen(false);
      setManualOpen(true);
    } catch (e) {
      Alert.alert('Cannot open manual sale', e.message);
    } finally {
      setManualLoading(false);
    }
  }

  const manualLines = manualProducts.filter((product) => manualCart[product.id] > 0).map((product) => ({
    ...product,
    qty: manualCart[product.id],
  }));
  const manualTotal = manualLines.reduce((sum, item) => sum + item.price * item.qty, 0);
  const shownManualProducts = manualProducts.filter((product) =>
    (manualCategory === 'All' || product.category === manualCategory) &&
    (product.name + ' ' + (product.barcode || '')).toLowerCase().includes(manualSearch.trim().toLowerCase())
  );
  const shownManualCustomers = manualCustomers.filter((customer) =>
    (customer.name + ' ' + (customer.phone || '') + ' ' + (customer.code || '')).toLowerCase().includes(manualCustomerSearch.trim().toLowerCase())
  );
  const selectedManualCustomer = manualCustomers.find((customer) => customer.id === manualCustomerId);

  const todayInput = localDateInput();
  const yesterdayInput = (() => { const y = new Date(); y.setDate(y.getDate() - 1); return localDateInput(y); })();

  function changeManualQty(productId, delta) {
    setManualCart((current) => ({ ...current, [productId]: Math.max(0, (current[productId] || 0) + delta) }));
  }

  async function saveManualSale(allowOverLimit = false) {
    if (manualSaving) return;
    if (!manualLines.length) {
      Alert.alert('No products selected', 'Add at least one product to this sale.');
      return;
    }
    const paidAmount = parseAmount(manualPaid);
    if (paidAmount > manualTotal) {
      Alert.alert('Invalid amount', 'The amount paid cannot be greater than the sale total.');
      return;
    }
    if (paidAmount < manualTotal && !manualCustomerId) {
      Alert.alert('Select a customer', 'A customer is required when the sale has an unpaid balance.');
      return;
    }
    const createdAt = localDateTimestamp(manualDate);
    if (createdAt === null || createdAt > Date.now()) {
      Alert.alert('Invalid sale date', 'Pick a valid date that is not in the future.');
      return;
    }

    Keyboard.dismiss();
    setManualSaving(true);
    try {
      await createSale({
        idempotencyKey: uid(),
        items: manualLines.map((item) => ({
          productId: item.id,
          name: item.name,
          unitPrice: item.price,
          unitCost: item.cost,
          qty: item.qty,
          tracked: !!item.tracked,
        })),
        customerId: manualCustomerId || null,
        payments: paidAmount > 0 ? [{ method: manualMethod, amount: paidAmount }] : [],
        createdAt,
        allowOverLimit,
      });
      setManualOpen(false);
      setManualCart({});
      setManualCustomerId('');
      setManualPaid('0');
      setManualMethod('Cash');
      setManualDate(localDateInput());
      setManualCalOpen(false);
      setManualSearch('');
      setManualCustomerSearch('');
      setRange({ from: createdAt, to: createdAt });
    } catch (e) {
      if (e.code === 'CREDIT_LIMIT') {
        const { balance, limit, credit } = e.details;
        Alert.alert(
          'Credit limit exceeded',
          `Current debt ${fcfa(balance)} + this sale on credit ${fcfa(credit)} exceeds the limit of ${fcfa(limit)}.`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Authorize', onPress: () => saveManualSale(true) }]
        );
      } else {
        Alert.alert('Cannot record manual sale', e.message);
      }
    } finally {
      setManualSaving(false);
    }
  }

  async function exportSaleReceipt(sale, action) {
    if (receiptBusyId) return;
    setReceiptBusyId(sale.id);
    try {
      const logoUri = await getReportLogoDataUri();
      const html = buildSaleReceiptHtml({ logoUri, sale });
      if (action === 'print') {
        await printHtml(html);
      } else {
        const fileName = `${safeFilePart(`${sale.receipt_no || 'receipt'} - ${sale.customer_name || 'customer'}`, 'receipt')}.pdf`;
        await savePdf({ html, fileName, share: action === 'share' });
      }
    } catch (e) {
      Alert.alert(`Cannot ${action} receipt`, e.message || String(e));
    } finally {
      setReceiptBusyId(null);
    }
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

  return (
    <ScrollView style={screenStyle} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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
          <Card style={{ marginBottom: 14 }}>
            <Text style={s.pdfTitle}>Sales entered after the fact?</Text>
            <Text style={s.pdfSub}>Record a sale for a selected day, including products, customer, and amount paid.</Text>
            <Btn
              small
              variant="gold"
              icon="add-circle-outline"
              title={manualLoading ? 'Loading…' : 'Record sale manually'}
              onPress={openManualSale}
              disabled={manualLoading}
              style={{ marginTop: 12 }}
            />
          </Card>

          <Card>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <IconDot name="document-text-outline" size={38} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.pdfTitle}>{periodTitle} · PDF</Text>
                <Text style={s.pdfSub} numberOfLines={2}>{rangeLabel(range.from, range.to)}</Text>
              </View>
            </View>
            <View style={s.pdfActions}>
              <Btn small variant="gold" icon="download-outline" title={exporting ? 'Preparing…' : 'Download PDF'} style={{ flex: 1 }} onPress={() => exportReport(false)} disabled={exporting} />
              <Btn small variant="soft" icon="share-social-outline" title="Share" style={{ flex: 1 }} onPress={() => exportReport(true)} disabled={exporting} />
            </View>
            <Text style={s.fine}>Pick Today for a daily report, 7 days for weekly, This month for monthly, or any custom dates.</Text>
          </Card>

          <Card style={{ marginTop: 14 }}>
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
                    <>
                      <View style={s.saleActions}>
                        <Btn small variant="soft" icon="create-outline" title="Edit paid" style={{ flex: 1 }}
                          onPress={() => { setEditingSale(x); setPaidInput(String(x.paid_amount || 0)); setPaymentMethod('Cash'); }} />
                        <Btn small variant="dangerSoft" icon="close-circle-outline" title="Cancel" style={{ flex: 1 }} onPress={() => setCancelId(x.id)} />
                      </View>
                      <View style={s.receiptActions}>
                        <Btn small variant="soft" icon="print-outline" title="Print" style={{ flex: 1 }}
                          onPress={() => exportSaleReceipt(x, 'print')} disabled={receiptBusyId === x.id} />
                        <Btn small variant="soft" icon="download-outline" title="Download" style={{ flex: 1 }}
                          onPress={() => exportSaleReceipt(x, 'download')} disabled={receiptBusyId === x.id} />
                        <Btn small variant="soft" icon="share-social-outline" title="Share" style={{ flex: 1 }}
                          onPress={() => exportSaleReceipt(x, 'share')} disabled={receiptBusyId === x.id} />
                      </View>
                    </>
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

      <KeyboardSheet visible={manualOpen} title="Record sale manually" onClose={() => setManualOpen(false)} tall>
        <Text style={s.cap}>Sale date</Text>
        <View style={s.dateQuickRow}>
          <Chip
            label="Today"
            active={manualDate === todayInput}
            onPress={() => { setManualDate(todayInput); setManualCalOpen(false); }}
          />
          <Chip
            label="Yesterday"
            active={manualDate === yesterdayInput}
            onPress={() => { setManualDate(yesterdayInput); setManualCalOpen(false); }}
          />
        </View>
        <Pressable
          onPress={() => { Keyboard.dismiss(); setManualCalOpen((v) => !v); }}
          style={({ pressed }) => [s.dateBtn, manualCalOpen && s.dateBtnOpen, pressed && { opacity: 0.85 }]}
        >
          <View style={s.dateIcon}>
            <Ionicons name="calendar" size={18} color={colors.forestDark} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.dateBtnLabel}>Selected day</Text>
            <Text style={s.dateBtnValue}>{prettyDate(manualDate)}</Text>
          </View>
          <Ionicons name={manualCalOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.muted} />
        </Pressable>
        {manualCalOpen ? (
          <CalendarPicker
            value={manualDate}
            onChange={(v) => { setManualDate(v); setManualCalOpen(false); }}
          />
        ) : null}

        <Text style={[s.cap, { marginTop: 16 }]}>Customer</Text>
        <Chip label={manualCustomerId ? 'Clear customer' : 'Walk-in sale'} active={!manualCustomerId} onPress={() => setManualCustomerId('')} />
        {selectedManualCustomer ? <Text style={s.manualHint}>Selected: {selectedManualCustomer.name}</Text> : null}
        <Field
          label="Search customers"
          value={manualCustomerSearch}
          onChangeText={setManualCustomerSearch}
          placeholder="Name, phone or code"
        />
        <View style={s.manualCustomerList}>
          {shownManualCustomers.map((customer) => (
            <Chip
              key={customer.id}
              label={`${customer.name}${customer.balance > 0 ? ` · owes ${num(customer.balance)}` : ''}`}
              active={manualCustomerId === customer.id}
              onPress={() => setManualCustomerId(customer.id)}
            />
          ))}
          {shownManualCustomers.length === 0 && <Text style={s.manualHint}>No customers match your search.</Text>}
        </View>

        <Text style={[s.cap, { marginTop: 16 }]}>Products</Text>
        <Field label="Filter products" value={manualSearch} onChangeText={setManualSearch} placeholder="Search product name or barcode" />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          {['All', ...Array.from(new Set(manualProducts.map((product) => product.category)))].map((category) => (
            <Chip key={category} label={category} active={manualCategory === category} onPress={() => setManualCategory(category)} />
          ))}
        </ScrollView>
        {shownManualProducts.map((product) => (
          <View key={product.id} style={s.manualProduct}>
            <View style={{ flex: 1 }}>
              <Text style={s.manualProductName}>{product.name}</Text>
              <Text style={s.manualHint}>{product.category} · {fcfa(product.price)}</Text>
            </View>
            <Btn small variant="soft" icon="remove" title="" onPress={() => changeManualQty(product.id, -1)} disabled={!manualCart[product.id]} />
            <Text style={s.manualQty}>{manualCart[product.id] || 0}</Text>
            <Btn small variant="gold" icon="add" title="" onPress={() => changeManualQty(product.id, 1)} />
          </View>
        ))}
        {shownManualProducts.length === 0 && <Text style={s.manualHint}>No products match your filters.</Text>}

        <Text style={[s.cap, { marginTop: 16 }]}>Selected items · {fcfa(manualTotal)}</Text>
        {manualLines.map((item) => (
          <View key={item.id} style={s.manualSelectedLine}>
            <Text style={{ flex: 1, color: colors.ink, fontWeight: '700' }}>{item.qty} × {item.name}</Text>
            <Text style={{ color: colors.ink, fontWeight: '800' }}>{fcfa(item.qty * item.price)}</Text>
          </View>
        ))}
        <Field
          label="Amount paid (FCFA)"
          keyboardType="number-pad"
          value={manualPaid}
          onChangeText={setManualPaid}
          inputStyle={{ fontSize: 22, fontWeight: '800', minHeight: 58 }}
        />
        <Text style={s.manualHint}>Balance due: {fcfa(Math.max(0, manualTotal - parseAmount(manualPaid)))}</Text>
        <Text style={[s.cap, { marginTop: 14 }]}>Payment method</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 14 }}>
          {METHODS.map((method) => (
            <Chip key={method} icon={METHOD_ICONS[method]} label={method} active={manualMethod === method} onPress={() => setManualMethod(method)} />
          ))}
        </View>
        <Btn
          icon="checkmark-circle"
          title={manualSaving ? 'Recording…' : `Record sale · ${fcfa(manualTotal)}`}
          onPress={() => saveManualSale(false)}
          disabled={manualSaving || manualLines.length === 0 || parseAmount(manualPaid) > manualTotal}
        />
      </KeyboardSheet>

      <KeyboardSheet visible={!!editingSale} title="Edit amount paid" onClose={() => setEditingSale(null)}>
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
      </KeyboardSheet>

      <KeyboardSheet visible={expOpen} title="New expense" onClose={() => setExpOpen(false)}>
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
      </KeyboardSheet>

      <KeyboardSheet visible={!!cancelId} title="Cancel sale" onClose={() => setCancelId(null)}>
        <Text style={{ color: colors.muted, marginBottom: 14, lineHeight: 20 }}>
          The sale stays on record as cancelled. Stock is restored and any credit is reversed. A reason is required.
        </Text>
        <Field label="Reason" value={reason} onChangeText={setReason} />
        <Btn variant="danger" icon="close-circle" title={busy ? 'Cancelling…' : 'Confirm cancellation'} onPress={doCancel} disabled={busy || !reason.trim()} />
      </KeyboardSheet>
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

  pdfTitle: { fontSize: 15, fontWeight: '800', color: colors.ink },
  pdfSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  pdfActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  receiptActions: { flexDirection: 'row', gap: 6, marginTop: 8 },
  manualCustomerList: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 6, marginBottom: 8 },
  manualProduct: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line, paddingVertical: 8, gap: 7 },
  manualProductName: { color: colors.ink, fontWeight: '700', fontSize: 14 },
  manualHint: { color: colors.muted, fontSize: 12, marginTop: 3 },
  manualQty: { minWidth: 22, textAlign: 'center', color: colors.ink, fontWeight: '800' },
  manualSelectedLine: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 },

  // Date picker (manual sale)
  dateQuickRow: { flexDirection: 'row', marginBottom: 10 },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14,
    borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, paddingVertical: 11,
  },
  dateBtnOpen: { borderColor: colors.gold },
  dateIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: colors.goldTint,
    alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  dateBtnLabel: { fontSize: 11, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  dateBtnValue: { fontSize: 16, color: colors.ink, fontWeight: '800', marginTop: 2 },

  cal: {
    marginTop: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 8, paddingVertical: 10,
  },
  calHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  calNav: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F1E8', alignItems: 'center', justifyContent: 'center' },
  calTitle: { fontSize: 16, fontWeight: '800', color: colors.ink },
  calRow: { flexDirection: 'row' },
  calWeekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted, paddingVertical: 6 },
  calCell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  calDay: { width: '100%', height: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  calDayToday: { borderWidth: 1.5, borderColor: colors.gold },
  calDaySelected: { backgroundColor: colors.gold },
  calDayText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  calDayTextDisabled: { color: colors.muted, opacity: 0.35 },
  calDayTextSelected: { color: colors.forestDark, fontWeight: '900' },

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