import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, Alert, StyleSheet, TextInput, Modal, Platform } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Card, Btn, Chip, Field, Sheet, Row, useLoad, screenStyle } from '../../src/components/ui';
import { getProducts, getCustomers, createSale } from '../../src/api/repo';
import { fcfa, parseAmount, uid } from '../../src/utils';
import { colors, METHODS, radius } from '../../src/theme';

export default function Sales() {
  const [data, reload] = useLoad(async () => ({ products: await getProducts(), customers: await getCustomers() }));
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({}); // productId -> qty
  const [priceOverrides, setPriceOverrides] = useState({});
  const [customer, setCustomer] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [pay, setPay] = useState({});
  const [pickCustomer, setPickCustomer] = useState(false);
  const [custQ, setCustQ] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(uid()); // one idempotency key per checkout attempt

  const products = data?.products ?? [];
  const customers = data?.customers ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(products.map((p) => p.category)))], [products]);
  const shown = products.filter(
    (p) => (cat === 'All' || p.category === cat) && (p.name + ' ' + (p.barcode || '')).toLowerCase().includes(q.trim().toLowerCase())
  );

  const lines = products.filter((p) => cart[p.id] > 0).map((p) => ({
    ...p, qty: cart[p.id], salePrice: priceOverrides[p.id] ?? p.price,
  }));
  const total = lines.reduce((s, l) => s + l.salePrice * l.qty, 0);
  const paid = METHODS.reduce((s, m) => s + parseAmount(pay[m]), 0);
  const credit = total - paid;
  const overpaid = paid > total;

  const setQty = (id, delta) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) + delta) }));
  const setPrice = (id, value) => setPriceOverrides((current) => ({ ...current, [id]: parseAmount(value) }));

  function reset() {
    setCart({});
    setPriceOverrides({});
    setPay({});
    setCustomer(null);
    setCustomerName('');
    keyRef.current = uid();
  }

  async function submit(allowOverLimit = false) {
    if (busy) return;
    setBusy(true);
    try {
      const items = lines.map((l) => ({
        productId: l.id, name: l.name, unitPrice: l.salePrice, unitCost: l.cost, qty: l.qty, tracked: !!l.tracked,
      }));
      const payments = METHODS.map((m) => ({ method: m, amount: parseAmount(pay[m]) })).filter((p) => p.amount > 0);
      const { sale } = await createSale({
        idempotencyKey: keyRef.current, items, customerId: customer?.id, customerName, payments, allowOverLimit,
      });
      setReceipt(sale);
      setCheckoutOpen(false);
      reset();
      reload();
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

  async function openScanner() {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access to scan product barcodes.');
        return;
      }
    }
    setScannerOpen(true);
  }

  function onBarcodeScanned({ data: code }) {
    if (!scannerOpen) return;
    setScannerOpen(false);
    const product = products.find((p) => p.barcode && p.barcode.trim().toLowerCase() === String(code).trim().toLowerCase());
    if (!product) {
      Alert.alert('Product not found', `No product is assigned to barcode ${code}. Add it in Stock and scan again.`);
      return;
    }
    setQty(product.id, 1);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[character]);
  }

  async function shareReceipt() {
    if (!receipt) return;
    const rows = (receipt.items || []).map((item) =>
      `<tr><td>${escapeHtml(item.product_name)}</td><td>${item.qty}</td><td>${fcfa(item.unit_price)}</td><td>${fcfa(item.line_total)}</td></tr>`
    ).join('');
    const html = `<html><body style="font-family:Arial;padding:24px;color:#1b1f1d"><h1>Manu's Resto</h1><h2>Receipt ${escapeHtml(receipt.receipt_no)}</h2><p>${escapeHtml(receipt.customer_name || 'Walk-in customer')} · ${new Date(receipt.created_at || Date.now()).toLocaleString()}</p><table style="width:100%;border-collapse:collapse" border="1" cellpadding="8"><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr>${rows}</table><h3>Total: ${fcfa(receipt.total)}</h3><p>Paid: ${fcfa(receipt.paid_amount)} · Credit: ${fcfa(receipt.credit_amount)}</p></body></html>`;
    try {
      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
        return;
      }
      const file = await Print.printToFileAsync({ html });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: `Receipt ${receipt.receipt_no}` });
      } else {
        Alert.alert('Receipt ready', `PDF saved to ${file.uri}`);
      }
    } catch (error) {
      Alert.alert('Cannot create receipt', error.message || String(error));
    }
  }

  const canConfirm = lines.length > 0 && !overpaid && !(credit > 0 && !customer) && lines.every((l) => l.salePrice > 0) && !busy;

  return (
    <View style={screenStyle}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput
            placeholder="Search meals, drinks or barcode…"
            placeholderTextColor="#A5A99F"
            value={q}
            onChangeText={setQ}
            style={[s.search, { flex: 1 }]}
          />
          <Btn title="Scan barcode" variant="ghost" onPress={openScanner} style={{ minHeight: 46, paddingHorizontal: 10 }} />
        </View>
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
          <>
          <Card style={{ marginTop: 16 }}>
            <Text style={s.h}>Cart</Text>
            {lines.map((l) => (
              <View key={l.id} style={s.cartRow}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontWeight: '500', color: colors.ink }}>{l.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>{fcfa(l.salePrice)} × {l.qty}</Text>
                </View>
                <Pressable onPress={() => setQty(l.id, -1)} style={s.qtyBtn}><Text style={s.qtyTxt}>−</Text></Pressable>
                <Text style={{ width: 28, textAlign: 'center', fontWeight: '700' }}>{l.qty}</Text>
                <Pressable onPress={() => setQty(l.id, 1)} style={s.qtyBtn}><Text style={s.qtyTxt}>+</Text></Pressable>
                <TextInput
                  value={String(l.salePrice)}
                  onChangeText={(value) => setPrice(l.id, value)}
                  keyboardType="number-pad"
                  accessibilityLabel={`${l.name} final unit price`}
                  style={[s.payInput, { width: 100, minHeight: 38, textAlign: 'right' }]}
                />
              </View>
            ))}
          </Card>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>Tap a final unit price to apply a discount or agreed price.</Text>
          </>
        )}

        {lines.length > 0 && (
          <Card style={{ marginTop: 16 }}>
            <Text style={s.h}>Cart total</Text>
            <Text style={{ color: colors.forest, fontSize: 20, fontWeight: '800' }}>{fcfa(total)}</Text>
            <Btn title="Checkout" onPress={() => setCheckoutOpen(true)} style={{ marginTop: 10 }} />
          </Card>
        )}
      </ScrollView>

      <View style={s.bar}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>Total</Text>
          <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{fcfa(total)}</Text>
        </View>
        <Btn title="Checkout" onPress={() => setCheckoutOpen(true)} disabled={!lines.length} style={{ minWidth: 160 }} />
      </View>

      <Sheet visible={checkoutOpen} title="Complete sale" onClose={() => setCheckoutOpen(false)}>
        <Text style={s.h}>Order items</Text>
        {lines.map((line) => (
          <View key={line.id} style={[s.cartRow, { borderBottomWidth: 1, borderBottomColor: colors.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '600' }}>{line.name}</Text>
              <Text style={{ color: colors.muted, fontSize: 12 }}>{fcfa(line.salePrice)} each</Text>
            </View>
            <Pressable onPress={() => setQty(line.id, -1)} style={s.qtyBtn}><Text style={s.qtyTxt}>−</Text></Pressable>
            <Text style={{ width: 28, textAlign: 'center', fontWeight: '700' }}>{line.qty}</Text>
            <Pressable onPress={() => setQty(line.id, 1)} style={s.qtyBtn}><Text style={s.qtyTxt}>+</Text></Pressable>
            <TextInput value={String(line.salePrice)} onChangeText={(value) => setPrice(line.id, value)}
              keyboardType="number-pad" accessibilityLabel={`${line.name} final unit price`}
              style={[s.payInput, { width: 92, minHeight: 38, textAlign: 'right' }]} />
          </View>
        ))}
        <Text style={{ color: colors.forest, fontWeight: '800', fontSize: 17, marginTop: 10, marginBottom: 12 }}>Total {fcfa(total)}</Text>
        <Text style={s.h}>Customer</Text>
        <Pressable onPress={() => setPickCustomer(true)} style={s.pick}>
          <Text style={{ color: customer ? colors.ink : colors.muted, fontSize: 16 }}>
            {customer ? customer.name : 'Select account customer (required for credit)'}
          </Text>
        </Pressable>
        {customer ? (
          <Text style={{ marginTop: 6, color: colors.muted }}>
            Owes now: <Text style={{ fontWeight: '700', color: colors.ink }}>{fcfa(customer.balance)}</Text>
            {customer.credit_limit > 0 ? ` · limit ${fcfa(customer.credit_limit)}` : ''}
          </Text>
        ) : (
          <Field label="Customer name (optional for paid sale)" value={customerName} onChangeText={setCustomerName} />
        )}
        <Text style={[s.h, { marginTop: 16 }]}>Payment received now</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
          <Btn title="Full cash" variant="ghost" style={{ flex: 1, minHeight: 40 }} onPress={() => setPay({ Cash: String(total) })} />
          <Btn title="All on credit" variant="ghost" style={{ flex: 1, minHeight: 40 }} onPress={() => setPay({})} />
        </View>
        {METHODS.map((m) => (
          <View key={m} style={s.payRow}>
            <Text style={{ flex: 1, color: colors.ink }}>{m}</Text>
            <TextInput value={pay[m] ?? ''} onChangeText={(t) => setPay((p) => ({ ...p, [m]: t.replace(/[^0-9]/g, '') }))}
              keyboardType="number-pad" placeholder="0" placeholderTextColor="#A5A99F" style={s.payInput} />
          </View>
        ))}
        <View style={s.summary}>
          <Text style={{ color: colors.muted }}>Total {fcfa(total)} · Paid {fcfa(paid)}</Text>
          {overpaid ? (
            <Text style={{ color: colors.danger, fontWeight: '700' }}>Payments exceed total by {fcfa(paid - total)}</Text>
          ) : credit > 0 ? (
            <Text style={{ color: colors.warn, fontWeight: '700' }}>
              On credit: {fcfa(credit)}{customer ? ` → new debt ${fcfa(customer.balance + credit)}` : ' · select a customer account'}
            </Text>
          ) : <Text style={{ color: colors.ok, fontWeight: '700' }}>Fully paid</Text>}
        </View>
        <Btn title={busy ? 'Saving…' : 'Record sale'} onPress={() => submit(false)} disabled={!canConfirm} style={{ marginTop: 16 }} />
      </Sheet>

      <Sheet visible={pickCustomer} title="Choose customer" onClose={() => setPickCustomer(false)}>
        <Field placeholder="Search name or phone" value={custQ} onChangeText={setCustQ} />
        <Btn variant="ghost" title="Walk-in customer" onPress={() => { setCustomer(null); setCustomerName(''); setPickCustomer(false); }} style={{ marginBottom: 8 }} />
        {customers
          .filter((c) => (c.name + (c.phone || '')).toLowerCase().includes(custQ.trim().toLowerCase()))
          .map((c) => (
            <Row
              key={c.id}
              left={c.name}
              sub={c.phone || undefined}
              right={fcfa(c.balance)}
              rightColor={c.balance > 0 ? colors.danger : colors.muted}
              onPress={() => { setCustomer(c); setCustomerName(c.name); setPickCustomer(false); }}
            />
          ))}
        {customers.length === 0 && <Text style={{ color: colors.muted }}>No customers yet. Add them in the Customers tab.</Text>}
      </Sheet>

      <Sheet visible={!!receipt} title={`Sale recorded · ${receipt?.receipt_no || ''}`} onClose={() => setReceipt(null)}>
        <Text style={{ color: colors.ink, marginBottom: 6 }}>Customer: {receipt?.customer_name || 'Walk-in customer'}</Text>
        <Text style={{ color: colors.ink, marginBottom: 6 }}>Total: {fcfa(receipt?.total)}</Text>
        <Text style={{ color: colors.ink, marginBottom: 14 }}>Paid: {fcfa(receipt?.paid_amount)} · Credit: {fcfa(receipt?.credit_amount)}</Text>
        <Btn title="Download / share receipt" onPress={shareReceipt} />
      </Sheet>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'] }}
          />
          <View style={{ position: 'absolute', top: 54, left: 20, right: 20 }}>
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', textAlign: 'center' }}>Scan a product barcode</Text>
            <Btn title="Close scanner" variant="ghost" onPress={() => setScannerOpen(false)} style={{ marginTop: 18, backgroundColor: '#fff' }} />
          </View>
        </View>
      </Modal>
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
