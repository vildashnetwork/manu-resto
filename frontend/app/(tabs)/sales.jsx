import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, Alert, StyleSheet, TextInput } from 'react-native';
import { Card, Btn, Chip, Field, Sheet, Row, useLoad, screenStyle } from '../../src/components/ui';
import { getProducts, getCustomers, createSale } from '../../src/api/repo';
import { fcfa, parseAmount, uid } from '../../src/utils';
import { colors, METHODS, radius } from '../../src/theme';

export default function Sales() {
  const [data, reload] = useLoad(async () => ({ products: await getProducts(), customers: await getCustomers() }));
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({}); // productId -> qty
  const [customer, setCustomer] = useState(null);
  const [pay, setPay] = useState({});
  const [pickCustomer, setPickCustomer] = useState(false);
  const [custQ, setCustQ] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(uid()); // one idempotency key per checkout attempt

  const products = data?.products ?? [];
  const customers = data?.customers ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const shown = products.filter(
    (p) => (cat === 'All' || p.category === cat) && p.name.toLowerCase().includes(q.trim().toLowerCase())
  );

  const lines = products.filter((p) => cart[p.id] > 0).map((p) => ({ ...p, qty: cart[p.id] }));
  const total = lines.reduce((s, l) => s + l.price * l.qty, 0);
  const paid = METHODS.reduce((s, m) => s + parseAmount(pay[m]), 0);
  const credit = total - paid;
  const overpaid = paid > total;

  const setQty = (id, delta) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));

  function reset() {
    setCart({});
    setPay({});
    setCustomer(null);
    keyRef.current = uid();
  }

  async function submit(allowOverLimit = false) {
    if (busy) return;
    setBusy(true);
    try {
      const items = lines.map((l) => ({
        productId: l.id, name: l.name, unitPrice: l.price, unitCost: l.cost, qty: l.qty, tracked: !!l.tracked,
      }));
      const payments = METHODS.map((m) => ({ method: m, amount: parseAmount(pay[m]) })).filter((p) => p.amount > 0);
      const { sale } = await createSale({
        idempotencyKey: keyRef.current, items, customerId: customer?.id, payments, allowOverLimit,
      });
      reset();
      reload();
      Alert.alert('Sale recorded', `${sale.receipt_no}\nTotal: ${fcfa(sale.total)}\nPaid: ${fcfa(sale.paid_amount)}\nOn credit: ${fcfa(sale.credit_amount)}`);
    } catch (e) {
      if (e.code === 'CREDIT_LIMIT') {
        const { balance, limit, credit: c } = e.details;
        Alert.alert(
          'Credit limit exceeded',
          `Current debt ${fcfa(balance)} + this sale on credit ${fcfa(c)} exceeds the limit of ${fcfa(limit)}.`,
          [{ text: 'Cancel', style: 'cancel' }, { text: 'Authorize', onPress: () => submit(true) }]
        );
      } else {
        Alert.alert('Cannot save sale', e.message);
      }
    } finally {
      setBusy(false);
    }
  }

  const canConfirm = lines.length > 0 && !overpaid && !(credit > 0 && !customer) && !busy;

  return (
    <View style={screenStyle}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <TextInput
          placeholder="Search meals and drinks…"
          placeholderTextColor="#A5A99F"
          value={q}
          onChangeText={setQ}
          style={s.search}
        />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginVertical: 12 }}>
          {categories.map((c) => <Chip key={c} label={c} active={cat === c} onPress={() => setCat(c)} />)}
        </ScrollView>

        <View style={s.grid}>
          {shown.map((p) => {
            const qty = cart[p.id] || 0;
            return (
              <Pressable key={p.id} onPress={() => setQty(p.id, 1)} style={[s.tile, qty > 0 && s.tileActive]}>
                {p.image_url ? <Image source={{ uri: p.image_url }} style={s.tileImage} /> : null}
                <Text style={s.tileName} numberOfLines={2}>{p.name}</Text>
                <Text style={s.tilePrice}>{fcfa(p.price)}</Text>
                {p.tracked ? <Text style={[s.tileStock, p.stock <= p.low_stock_threshold && { color: colors.danger }]}>Stock {p.stock}</Text> : null}
                {qty > 0 && <View style={s.badge}><Text style={s.badgeText}>{qty}</Text></View>}
              </Pressable>
            );
          })}
        </View>

        {lines.length > 0 && (
          <Card style={{ marginTop: 16 }}>
            <Text style={s.h}>Cart</Text>
            {lines.map((l) => (
              <View key={l.id} style={s.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '500', color: colors.ink }}>{l.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{fcfa(l.price)} × {l.qty}</Text>
                </View>
                <Pressable onPress={() => setQty(l.id, -1)} style={s.qtyBtn}><Text style={s.qtyTxt}>−</Text></Pressable>
                <Text style={{ width: 28, textAlign: 'center', fontWeight: '700' }}>{l.qty}</Text>
                <Pressable onPress={() => setQty(l.id, 1)} style={s.qtyBtn}><Text style={s.qtyTxt}>+</Text></Pressable>
                <Text style={{ width: 84, textAlign: 'right', fontWeight: '600' }}>{fcfa(l.price * l.qty)}</Text>
              </View>
            ))}
          </Card>
        )}

        {lines.length > 0 && (
          <Card style={{ marginTop: 16 }}>
            <Text style={s.h}>Customer (needed for credit)</Text>
            <Pressable onPress={() => setPickCustomer(true)} style={s.pick}>
              <Text style={{ color: customer ? colors.ink : colors.muted, fontSize: 16 }}>
                {customer ? customer.name : 'Walk-in customer — tap to choose'}
              </Text>
            </Pressable>
            {customer && (
              <Text style={{ marginTop: 6, color: colors.muted }}>
                Owes now: <Text style={{ fontWeight: '700', color: colors.ink }}>{fcfa(customer.balance)}</Text>
                {customer.credit_limit > 0 ? `  ·  limit ${fcfa(customer.credit_limit)}` : ''}
              </Text>
            )}

            <Text style={[s.h, { marginTop: 16 }]}>Payment received now</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
              <Btn title="Full cash" variant="ghost" style={{ flex: 1, minHeight: 40 }} onPress={() => setPay({ Cash: String(total) })} />
              <Btn title="All on credit" variant="ghost" style={{ flex: 1, minHeight: 40 }} onPress={() => setPay({})} />
            </View>
            {METHODS.map((m) => (
              <View key={m} style={s.payRow}>
                <Text style={{ flex: 1, color: colors.ink }}>{m}</Text>
                <TextInput
                  value={pay[m] ?? ''}
                  onChangeText={(t) => setPay((p) => ({ ...p, [m]: t.replace(/[^0-9]/g, '') }))}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor="#A5A99F"
                  style={[s.payInput]}
                />
              </View>
            ))}

            <View style={s.summary}>
              <Text style={{ color: colors.muted }}>Total {fcfa(total)}  ·  Paid {fcfa(paid)}</Text>
              {overpaid ? (
                <Text style={{ color: colors.danger, fontWeight: '700' }}>Payments exceed total by {fcfa(paid - total)}</Text>
              ) : credit > 0 ? (
                <Text style={{ color: colors.warn, fontWeight: '700' }}>
                  On credit: {fcfa(credit)}
                  {customer ? `  →  new debt ${fcfa(customer.balance + credit)}` : '  (choose a customer)'}
                </Text>
              ) : (
                <Text style={{ color: colors.ok, fontWeight: '700' }}>Fully paid</Text>
              )}
            </View>
          </Card>
        )}
      </ScrollView>

      <View style={s.bar}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Total</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{fcfa(total)}</Text>
        </View>
        <Btn title={busy ? 'Saving…' : 'Confirm sale'} onPress={() => submit(false)} disabled={!canConfirm} style={{ minWidth: 160 }} />
      </View>

      <Sheet visible={pickCustomer} title="Choose customer" onClose={() => setPickCustomer(false)}>
        <Field placeholder="Search name or phone" value={custQ} onChangeText={setCustQ} />
        <Btn variant="ghost" title="Walk-in (no account)" onPress={() => { setCustomer(null); setPickCustomer(false); }} style={{ marginBottom: 8 }} />
        {customers
          .filter((c) => (c.name + (c.phone || '')).toLowerCase().includes(custQ.trim().toLowerCase()))
          .map((c) => (
            <Row
              key={c.id}
              left={c.name}
              sub={c.phone || undefined}
              right={fcfa(c.balance)}
              rightColor={c.balance > 0 ? colors.danger : colors.muted}
              onPress={() => { setCustomer(c); setPickCustomer(false); }}
            />
          ))}
        {customers.length === 0 && <Text style={{ color: colors.muted }}>No customers yet. Add them in the Customers tab.</Text>}
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  search: {
    minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 14, fontSize: 16, backgroundColor: '#fff', color: colors.ink,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48%', minHeight: 92, backgroundColor: '#fff', borderRadius: radius.md, padding: 12,
    borderWidth: 1, borderColor: colors.line,
  },
  tileImage: { width: '100%', height: 92, borderRadius: radius.md, marginBottom: 8, backgroundColor: colors.cream },
  tileActive: { borderColor: colors.forest, borderWidth: 2 },
  tileName: { fontWeight: '600', color: colors.ink, fontSize: 15 },
  tilePrice: { color: colors.forest, fontWeight: '700', marginTop: 6 },
  tileStock: { color: colors.muted, fontSize: 11, marginTop: 2 },
  badge: {
    position: 'absolute', top: 8, right: 8, backgroundColor: colors.forest, borderRadius: 12,
    minWidth: 24, height: 24, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontWeight: '700' },
  h: { fontSize: 14, fontWeight: '700', color: colors.ink, marginBottom: 8 },
  cartRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  qtyBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.cream, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: colors.line,
  },
  qtyTxt: { fontSize: 20, fontWeight: '700', color: colors.forest },
  pick: { minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12, justifyContent: 'center' },
  payRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  payInput: {
    width: 130, minHeight: 42, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 10, textAlign: 'right', fontSize: 16, color: colors.ink,
  },
  summary: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.line, gap: 4 },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: colors.line,
  },
});
