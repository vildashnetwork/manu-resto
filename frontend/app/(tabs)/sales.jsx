import React, { useMemo, useRef, useState } from 'react';
import { View, Text, Image, ScrollView, Pressable, Alert, StyleSheet, TextInput, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Asset } from 'expo-asset';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  Hero, Card, Btn, Chip, Field, SearchBox, Sheet, Row, Avatar, IconDot, Money, Pill, Empty, useLoad, ScreenShimmer, screenStyle,
} from '../../src/components/ui';
import { getProducts, getCustomers, createSale } from '../../src/api/repo';
import { fcfa, parseAmount, uid } from '../../src/utils';
import { colors, METHODS, METHOD_ICONS, CATEGORY_ICONS, radius, shadow } from '../../src/theme';

let receiptLogoDataUriPromise;
const RECEIPT_PAGE = { width: 420, height: 595 };
const PAYMENT_TABS = [
  { label: 'MoMo', method: 'MTN MoMo', icon: METHOD_ICONS['MTN MoMo'] },
  { label: 'Cash', method: 'Cash', icon: METHOD_ICONS.Cash },
  { label: 'Credit', method: 'Credit', icon: 'time-outline' },
  { label: 'Bank transfer', method: 'Bank transfer', icon: METHOD_ICONS['Bank transfer'] },
  { label: 'Orange Money', method: 'Orange Money', icon: METHOD_ICONS['Orange Money'] },
  { label: 'Xcash', method: 'Xcash', icon: METHOD_ICONS.Xcash },
];

function getReceiptLogoDataUri() {
  if (!receiptLogoDataUriPromise) {
    receiptLogoDataUriPromise = (async () => {
      const logo = Asset.fromModule(require('../../public/receipt-logo.png'));
      await logo.downloadAsync();
      if (!logo.localUri) throw new Error('The restaurant logo could not be loaded for the receipt.');
      const logoBase64 = await FileSystem.readAsStringAsync(logo.localUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      return `data:image/png;base64,${logoBase64}`;
    })().catch((error) => {
      receiptLogoDataUriPromise = null;
      throw error;
    });
  }
  return receiptLogoDataUriPromise;
}

export default function Sales() {
  const [data, reload, loading] = useLoad(async () => ({ products: await getProducts(), customers: await getCustomers() }));
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState({}); // productId -> qty
  const [priceOverrides, setPriceOverrides] = useState({});
  const [customer, setCustomer] = useState(null);
  const [customerName, setCustomerName] = useState('');
  const [pay, setPay] = useState({});
  const [paymentTab, setPaymentTab] = useState('Cash');
  const [pickCustomer, setPickCustomer] = useState(false);
  const [custQ, setCustQ] = useState('');
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [receipt, setReceipt] = useState(null);
  const [receiptBusy, setReceiptBusy] = useState(false);
  const receiptPdfRef = useRef({ key: null, uri: null, base64: null });
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
    setPaymentTab('Cash');
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
      setReceipt({
        ...sale,
        payments: METHODS
          .filter((method) => parseAmount(pay[method]) > 0)
          .map((method) => ({ method, amount: parseAmount(pay[method]) })),
      });
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

  function safeFilePart(value, fallback) {
    return String(value || fallback)
      .normalize('NFC')
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/[. ]+$/g, '') || fallback;
  }

  async function exportReceipt(share = false) {
    if (!receipt || receiptBusy) return;
    setReceiptBusy(true);
    try {
      const logoUri = await getReceiptLogoDataUri();
      const receiptKey = String(receipt.id || receipt.receipt_no || receipt.created_at);
      const safeCustomerName = safeFilePart(receipt.customer_name, 'Walk-in customer');
      const safeReceiptNo = safeFilePart(receipt.receipt_no, 'receipt');
      const fileName = `${safeCustomerName}-${safeReceiptNo}.pdf`;
      const rows = (receipt.items || []).map((item, index) => `
        <tr>
          <td class="item-cell"><span class="item-number">${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(item.product_name)}</strong></td>
          <td class="number">${item.qty}</td>
          <td class="number">${fcfa(item.unit_price)}</td>
          <td class="number total-cell">${fcfa(item.line_total)}</td>
        </tr>`).join('');
      const paymentRows = (receipt.payments || []).length
        ? receipt.payments.map((payment) => `<div class="payment-row"><span>${escapeHtml(payment.method)}</span><strong>${fcfa(payment.amount)}</strong></div>`).join('')
        : '<div class="payment-row"><span>Payment received</span><strong>None</strong></div>';
      const createdAt = new Date(receipt.created_at || Date.now());
      const date = createdAt.toLocaleDateString(undefined, { day: '2-digit', month: 'long', year: 'numeric' });
      const time = createdAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
      const html = `<!doctype html>
        <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(fileName.replace(/\.pdf$/i, ''))}</title>
        <style>
          @page { size: 148mm 210mm; margin: 12mm; }
          * { box-sizing: border-box; }
          body { margin: 0; background: #f3f0e8; color: #202a23; font-family: Arial, Helvetica, sans-serif; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .receipt { max-width: 720px; margin: 0 auto; padding: 28px; background: #fff; border: 1px solid #e8e3d8; }
          .brand { display: flex; align-items: center; gap: 16px; padding: 0 0 20px; border-bottom: 2px solid #c49b3c; }
          .logo { display: block; width: 104px; height: 104px; object-fit: contain; flex: 0 0 104px; }
          .brand-copy { min-width: 0; }
          .eyebrow { margin: 0 0 5px; color: #a47c22; font-size: 10px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; }
          h1 { margin: 0; color: #123a2b; font-family: Georgia, 'Times New Roman', serif; font-size: 27px; line-height: 1.1; }
          .tagline { margin: 7px 0 0; color: #69736d; font-size: 10px; letter-spacing: 1.1px; text-transform: uppercase; }
          .title-row { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; margin: 22px 0 14px; }
          h2 { margin: 0; color: #123a2b; font-size: 20px; }
          .receipt-no { color: #89723a; font-size: 11px; font-weight: 700; text-align: right; }
          .meta { display: flex; gap: 10px; margin-bottom: 20px; }
          .meta-card { flex: 1; min-width: 0; padding: 11px 12px; background: #f6f5ef; border-radius: 7px; }
          .meta-label { display: block; margin-bottom: 5px; color: #778078; font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
          .meta-value { color: #202a23; font-size: 12px; font-weight: 600; overflow-wrap: anywhere; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          thead { background: #123a2b; color: #fff; }
          th { padding: 10px 8px; font-size: 9px; letter-spacing: .6px; text-align: left; text-transform: uppercase; }
          th.number, td.number { text-align: right; white-space: nowrap; }
          td { padding: 11px 8px; border-bottom: 1px solid #eeeae1; vertical-align: middle; }
          tbody tr:nth-child(even) { background: #fbfaf7; }
          .item-cell { min-width: 120px; }
          .item-number { display: inline-block; width: 24px; color: #a58a4b; font-size: 9px; }
          .total-cell { color: #123a2b; font-weight: 700; }
          .totals { margin: 18px 0 0 auto; width: min(100%, 300px); }
          .total-line { display: flex; justify-content: space-between; gap: 14px; padding: 6px 0; color: #626d65; font-size: 11px; }
          .grand-total { margin-top: 5px; padding: 13px 14px; background: #123a2b; border-radius: 7px; color: #fff; }
          .grand-total span { font-size: 11px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
          .grand-total strong { font-size: 18px; white-space: nowrap; }
          .settlement { display: flex; gap: 18px; margin-top: 18px; padding-top: 16px; border-top: 1px solid #e9e5db; }
          .payment-block { flex: 1.1; }
          .balance-block { flex: .9; padding: 12px; background: #fff6e5; border: 1px solid #f1e4c7; border-radius: 7px; }
          h3 { margin: 0 0 9px; color: #123a2b; font-size: 11px; }
          .payment-row { display: flex; justify-content: space-between; gap: 8px; padding: 5px 0; color: #626d65; font-size: 10px; }
          .payment-row strong { color: #202a23; white-space: nowrap; }
          .balance-label { display: block; margin-bottom: 5px; color: #89671f; font-size: 9px; font-weight: 700; letter-spacing: .7px; text-transform: uppercase; }
          .balance-value { color: #765516; font-size: 16px; font-weight: 800; }
          .footer { margin-top: 24px; padding-top: 14px; border-top: 1px dashed #d9d3c6; color: #68736b; font-size: 10px; line-height: 1.6; text-align: center; }
          .thanks { display: block; margin-bottom: 4px; color: #123a2b; font-family: Georgia, 'Times New Roman', serif; font-size: 16px; font-weight: 700; }
          @media print { body { background: #fff; } .receipt { max-width: none; padding: 0; border: 0; } }
          @media (max-width: 480px) { .receipt { padding: 18px; } .logo { width: 78px; height: 78px; flex-basis: 78px; } h1 { font-size: 22px; } th, td { padding: 8px 5px; } .settlement { gap: 10px; } }
        </style></head><body><main class="receipt">
          <header class="brand"><img class="logo" src="${logoUri}" alt="Manu's Resto logo"><div class="brand-copy">
            <p class="eyebrow">Good food · Great drinks · Happy people</p><h1>Manu’s Resto</h1>
            <p class="tagline">Thank you for dining with us</p></div></header>
          <section class="title-row"><h2>Sales receipt</h2><div class="receipt-no">RECEIPT<br>${escapeHtml(receipt.receipt_no)}</div></section>
          <section class="meta"><div class="meta-card"><span class="meta-label">Customer</span><span class="meta-value">${escapeHtml(receipt.customer_name || 'Walk-in customer')}</span></div>
            <div class="meta-card"><span class="meta-label">Date</span><span class="meta-value">${escapeHtml(date)} · ${escapeHtml(time)}</span></div></section>
          <table><thead><tr><th>Item</th><th class="number">Qty</th><th class="number">Unit price</th><th class="number">Amount</th></tr></thead><tbody>${rows}</tbody></table>
          <section class="totals"><div class="total-line"><span>Items</span><strong>${(receipt.items || []).reduce((sum, item) => sum + item.qty, 0)}</strong></div>
            <div class="total-line grand-total"><span>Total due</span><strong>${fcfa(receipt.total)}</strong></div></section>
          <section class="settlement"><div class="payment-block"><h3>Payment details</h3>${paymentRows}
            <div class="payment-row"><span>Total paid</span><strong>${fcfa(receipt.paid_amount)}</strong></div></div>
            <div class="balance-block"><span class="balance-label">${receipt.credit_amount > 0 ? 'Balance on account' : 'Balance remaining'}</span>
            <span class="balance-value">${fcfa(receipt.credit_amount)}</span></div></section>
          <footer class="footer"><span class="thanks">Thank you for choosing Manu’s Resto!</span>
            We hope to serve you again soon.<br><strong>Good food · Great drinks · Happy people</strong></footer>
        </main></body></html>`;
      if (Platform.OS === 'web') {
        await Print.printAsync({ html, ...RECEIPT_PAGE });
        return;
      }
      const cachedPdf = receiptPdfRef.current.key === receiptKey ? receiptPdfRef.current : null;
      let pdfUri = cachedPdf?.uri || null;
      let pdfBase64 = cachedPdf?.base64 || null;
      if (!pdfUri) {
        const file = await Print.printToFileAsync({
          html,
          ...RECEIPT_PAGE,
          ...(Platform.OS === 'android' ? { base64: true } : {}),
        });
        pdfUri = file.uri;
        pdfBase64 = file.base64 || null;
        receiptPdfRef.current = { key: receiptKey, uri: pdfUri, base64: pdfBase64 };
      }
      if (Platform.OS === 'android') {
        if (!pdfBase64) throw new Error('The PDF could not be prepared for saving.');
        if (share) {
          if (!FileSystem.documentDirectory) throw new Error('The app document folder is unavailable.');
          if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
          const shareUri = `${FileSystem.documentDirectory}${fileName}`;
          await FileSystem.writeAsStringAsync(shareUri, pdfBase64, {
            encoding: FileSystem.EncodingType.Base64,
          });
          await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', dialogTitle: fileName });
          return;
        }
        const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert('Download cancelled', 'Choose a folder to save the receipt PDF.');
          return;
        }
        const savedUri = await FileSystem.StorageAccessFramework.createFileAsync(
          permission.directoryUri,
          fileName,
          'application/pdf'
        );
        await FileSystem.StorageAccessFramework.writeAsStringAsync(savedUri, pdfBase64, {
          encoding: FileSystem.EncodingType.Base64,
        });
        Alert.alert('Receipt downloaded', `Saved as ${fileName}`);
        return;
      }
      const printOptions = { html, ...RECEIPT_PAGE };
      if (!FileSystem.documentDirectory) throw new Error('The app document folder is unavailable.');
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      const shareUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.copyAsync({ from: pdfUri, to: shareUri });
      await Sharing.shareAsync(shareUri, { mimeType: 'application/pdf', dialogTitle: fileName });
    } catch (error) {
      const message = error.message || String(error);
      Alert.alert(share ? 'Cannot share receipt' : 'Cannot download receipt', message);
    } finally {
      setReceiptBusy(false);
    }
  }

  const canConfirm = lines.length > 0 && !overpaid && !(credit > 0 && !customer) && lines.every((l) => l.salePrice > 0) && !busy;

  const itemCount = lines.reduce((n, l) => n + l.qty, 0);
  const stockInfo = (p) => ({
    low: p.tracked && p.low_stock_threshold > 0 && p.stock <= p.low_stock_threshold,
    out: p.tracked && p.stock <= 0,
  });

  if (loading && !data) return <ScreenShimmer variant="sales" />;

  return (
    <View style={screenStyle}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 120 }}>
        <Hero eyebrow="Tap items to add" title="New sale">
          <View style={s.searchRow}>
            <View style={{ flex: 1 }}>
              <SearchBox dark value={q} onChangeText={setQ} placeholder="Search meals, drinks or barcode…" />
            </View>
            <Pressable onPress={openScanner} style={({ pressed }) => [s.scanBtn, { opacity: pressed ? 0.85 : 1 }]} accessibilityLabel="Scan barcode">
              <Ionicons name="barcode-outline" size={26} color={colors.forestDark} />
            </Pressable>
          </View>
        </Hero>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}>
          {categories.map((c) => (
            <Chip key={c} label={c} icon={c === 'All' ? 'apps-outline' : CATEGORY_ICONS[c] || 'pricetag-outline'} active={cat === c} onPress={() => setCat(c)} />
          ))}
        </ScrollView>

        <View style={s.grid}>
          {shown.map((p) => {
            const qty = cart[p.id] || 0;
            const { low, out } = stockInfo(p);
            const tag = p.tracked ? (
              <View style={[s.stockTag, (low || out) && { backgroundColor: colors.dangerTint }]}>
                <Text style={[s.stockTagText, (low || out) && { color: colors.danger }]}>{out ? 'Out' : `${p.stock} left`}</Text>
              </View>
            ) : null;
            return (
              <Pressable key={p.id} onPress={() => setQty(p.id, 1)} style={({ pressed }) => [s.tile, qty > 0 && s.tileActive, { opacity: pressed ? 0.9 : 1 }]}>
                {p.image_url ? (
                  <View>
                    <Image source={{ uri: p.image_url }} style={s.tileImage} />
                    <View style={s.tagOnImage}>{tag}</View>
                  </View>
                ) : (
                  <View style={s.tileTop}>
                    <IconDot name={CATEGORY_ICONS[p.category] || 'pricetag-outline'} size={36} />
                    {tag}
                  </View>
                )}
                <Text style={s.tileName} numberOfLines={2}>{p.name}</Text>
                <Text style={s.tileUnit}>{p.unit ? `per ${p.unit}` : ' '}</Text>
                <View style={s.tileBottom}>
                  <Text style={s.tilePrice}>{fcfa(p.price)}</Text>
                  {qty > 0 ? (
                    <View style={s.stepper}>
                      <Pressable onPress={() => setQty(p.id, -1)} hitSlop={8} style={s.stepBtn}><Ionicons name="remove" size={16} color={colors.forest} /></Pressable>
                      <Text style={s.stepQty}>{qty}</Text>
                      <Pressable onPress={() => setQty(p.id, 1)} hitSlop={8} style={[s.stepBtn, { backgroundColor: colors.forest }]}><Ionicons name="add" size={16} color="#fff" /></Pressable>
                    </View>
                  ) : (
                    <View style={[s.stepBtn, { backgroundColor: colors.forestTint }]}><Ionicons name="add" size={18} color={colors.forest} /></View>
                  )}
                </View>
              </Pressable>
            );
          })}
        </View>
        {shown.length === 0 && <Empty icon="search-outline" title="Nothing found" hint="Try another search, category or scan a barcode." />}
      </ScrollView>

      {itemCount > 0 && (
        <Pressable onPress={() => setCheckoutOpen(true)} style={({ pressed }) => [s.cartBar, { opacity: pressed ? 0.92 : 1 }]}>
          <View style={s.cartCount}><Text style={s.cartCountText}>{itemCount}</Text></View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600' }}>{itemCount === 1 ? '1 item' : `${itemCount} items`}</Text>
            <Money value={total} size={20} color="#fff" />
          </View>
          <Text style={{ color: colors.gold, fontWeight: '800', fontSize: 16 }}>Checkout</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.gold} />
        </Pressable>
      )}

      <Sheet
        visible={checkoutOpen}
        tall
        title={pickCustomer ? 'Choose customer' : 'Complete sale'}
        onClose={() => (pickCustomer ? setPickCustomer(false) : setCheckoutOpen(false))}
      >
        {pickCustomer ? (
          <View>
            <SearchBox value={custQ} onChangeText={setCustQ} placeholder="Search name or phone" />
            <Btn variant="soft" icon="walk-outline" title="Walk-in customer" onPress={() => { setCustomer(null); setCustomerName(''); setPickCustomer(false); }} style={{ marginVertical: 12 }} />
            <Card style={{ paddingVertical: 4 }}>
              {customers
                .filter((c) => (c.name + (c.phone || '')).toLowerCase().includes(custQ.trim().toLowerCase()))
                .map((c, i, arr) => (
                  <Row
                    key={c.id}
                    last={i === arr.length - 1}
                    leading={<Avatar name={c.name} />}
                    left={c.name}
                    sub={c.phone || undefined}
                    right={c.balance > 0 ? fcfa(c.balance) : 'No debt'}
                    rightColor={c.balance > 0 ? colors.danger : colors.ok}
                    onPress={() => { setCustomer(c); setCustomerName(c.name); setPickCustomer(false); }}
                  />
                ))}
              {customers.length === 0 && <Empty icon="people-outline" title="No customers yet" hint="Add them in the Customers tab." />}
            </Card>
          </View>
        ) : (
          <View>
            <Text style={s.h}>Order items</Text>
            <Card style={{ paddingVertical: 4 }}>
              {lines.map((l, i) => {
                const diff = l.price - l.salePrice;
                return (
                  <View key={l.id} style={[s.lineBlock, i === lines.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={s.lineHead}>
                      <Text style={s.lineName} numberOfLines={1}>{l.name}</Text>
                      <Text style={s.lineTotal}>{fcfa(l.salePrice * l.qty)}</Text>
                    </View>
                    <View style={s.lineControls}>
                      <View style={s.stepper}>
                        <Pressable onPress={() => setQty(l.id, -1)} hitSlop={8} style={s.stepBtn}><Ionicons name="remove" size={16} color={colors.forest} /></Pressable>
                        <Text style={s.stepQty}>{l.qty}</Text>
                        <Pressable onPress={() => setQty(l.id, 1)} hitSlop={8} style={[s.stepBtn, { backgroundColor: colors.forest }]}><Ionicons name="add" size={16} color="#fff" /></Pressable>
                      </View>
                      <View style={s.priceBox}>
                        <Text style={s.priceCap}>Unit price</Text>
                        <TextInput
                          value={String(l.salePrice)}
                          onChangeText={(value) => setPrice(l.id, value)}
                          keyboardType="number-pad"
                          accessibilityLabel={`${l.name} final unit price`}
                          style={s.priceInput}
                        />
                      </View>
                    </View>
                    {diff !== 0 && (
                      <View style={{ marginTop: 8 }}>
                        <Pill tone={diff > 0 ? 'gold' : 'neutral'} label={diff > 0 ? `Discount ${fcfa(diff)} each (list ${fcfa(l.price)})` : `Above list price by ${fcfa(-diff)}`} />
                      </View>
                    )}
                  </View>
                );
              })}
            </Card>
            <Text style={s.fine}>Edit a unit price to apply a discount or an agreed price.</Text>

            <Text style={s.h}>Customer</Text>
            <Pressable onPress={() => setPickCustomer(true)}>
              <Card style={{ flexDirection: 'row', alignItems: 'center' }}>
                {customer ? <Avatar name={customer.name} /> : <IconDot name="person-outline" />}
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontWeight: '700', color: colors.ink, fontSize: 15 }}>{customer ? customer.name : 'Select account customer'}</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                    {customer
                      ? `Owes ${fcfa(customer.balance)}${customer.credit_limit > 0 ? ` · limit ${fcfa(customer.credit_limit)}` : ''}`
                      : 'Required if any part is left on credit'}
                  </Text>
                </View>
                <Text style={{ color: colors.forestMid, fontWeight: '700' }}>{customer ? 'Change' : 'Choose'}</Text>
              </Card>
            </Pressable>
            {!customer && (
              <Field style={{ marginTop: 12 }} label="Customer name (optional for a paid sale)" value={customerName} onChangeText={setCustomerName} />
            )}

            <Text style={s.h}>Payment received now</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.paymentTabs}>
              {PAYMENT_TABS.map((tab) => {
                const active = paymentTab === tab.method;
                return (
                  <Pressable
                    key={tab.method}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: active }}
                    onPress={() => {
                      setPaymentTab(tab.method);
                      if (tab.method === 'Credit') setPay({});
                    }}
                    style={[s.paymentTab, active && s.paymentTabActive]}
                  >
                    <Ionicons name={tab.icon} size={17} color={active ? '#fff' : colors.muted} />
                    <Text style={[s.paymentTabText, active && s.paymentTabTextActive]}>{tab.label}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
            <Card style={{ paddingVertical: 6 }}>
              {paymentTab === 'Credit' ? (
                <View style={s.creditTabContent}>
                  <IconDot name="time-outline" size={38} color={colors.warn} bg={colors.warnTint} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.ink, fontWeight: '700' }}>Record this sale on credit</Text>
                    <Text style={s.fine}>No payment is collected now. Select a customer account below.</Text>
                  </View>
                </View>
              ) : (
                <View style={s.payRow}>
                  <IconDot name={METHOD_ICONS[paymentTab]} size={34} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ flex: 1, color: colors.ink, fontWeight: '600' }}>{paymentTab}</Text>
                      <TextInput
                        value={pay[paymentTab] ?? ''}
                        onChangeText={(t) => setPay((p) => ({ ...p, [paymentTab]: t.replace(/[^0-9]/g, '') }))}
                        keyboardType="number-pad"
                        placeholder="0"
                        placeholderTextColor={colors.faint}
                        style={s.payInput}
                      />
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Charge full total to ${paymentTab}`}
                      onPress={() => setPay({ [paymentTab]: String(total) })}
                      style={s.fullAmountButton}
                    >
                      <Text style={s.fullAmountText}>Full total</Text>
                    </Pressable>
                  </View>
                </View>
              )}
            </Card>
            {paymentTab !== 'Credit' && METHODS.some((method) => method !== paymentTab && parseAmount(pay[method]) > 0) ? (
              <Text style={s.fine}>Other payment tabs have amounts entered; they will be combined in this sale.</Text>
            ) : null}

            <View style={[s.summary, overpaid ? { backgroundColor: colors.dangerTint } : credit > 0 ? { backgroundColor: colors.warnTint } : { backgroundColor: colors.okTint }]}>
              <View style={s.sumRow}><Text style={s.sumLabel}>Total</Text><Text style={s.sumVal}>{fcfa(total)}</Text></View>
              <View style={s.sumRow}><Text style={s.sumLabel}>Paid now</Text><Text style={s.sumVal}>{fcfa(paid)}</Text></View>
              {overpaid ? (
                <Text style={{ color: colors.danger, fontWeight: '800', marginTop: 6 }}>Payments exceed the total by {fcfa(paid - total)}</Text>
              ) : credit > 0 ? (
                <Text style={{ color: colors.warn, fontWeight: '800', marginTop: 6 }}>
                  On credit {fcfa(credit)}{customer ? ` → new debt ${fcfa(customer.balance + credit)}` : ' · select a customer account'}
                </Text>
              ) : (
                <Text style={{ color: colors.ok, fontWeight: '800', marginTop: 6 }}>Fully paid ✓</Text>
              )}
            </View>

            <Btn variant="gold" icon="checkmark-circle" title={busy ? 'Saving…' : `Record sale · ${fcfa(total)}`} onPress={() => submit(false)} disabled={!canConfirm} style={{ marginTop: 16 }} />
          </View>
        )}
      </Sheet>

      <Sheet visible={!!receipt} tall title="Sale recorded" onClose={() => setReceipt(null)}>
        {receipt && (
          <View>
            <View style={s.successBanner}>
              <IconDot name="checkmark" size={40} color="#fff" bg={colors.ok} />
              <View style={{ marginLeft: 12, flex: 1 }}>
                <Text style={{ fontWeight: '800', color: colors.ok, fontSize: 15 }}>Saved successfully</Text>
                <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>
                  {receipt.credit_amount > 0 ? `${fcfa(receipt.credit_amount)} left on the customer's account` : 'Paid in full'}
                </Text>
              </View>
            </View>

            <View style={s.receiptPage}>
              <View style={s.receiptBrand}>
                <Image source={require('../../public/nobglogo.png')} style={s.receiptLogo} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={s.receiptEyebrow}>Good food · Great drinks · Happy people</Text>
                  <Text style={s.receiptBrandName}>Manu’s Resto</Text>
                  <Text style={s.receiptTagline}>Thank you for dining with us</Text>
                </View>
              </View>
              <View style={s.receiptTitleRow}>
                <Text style={s.receiptTitle}>Sales receipt</Text>
                <Text style={s.receiptNumber}>{receipt.receipt_no}</Text>
              </View>
              <View style={s.receiptMeta}>
                <View style={{ flex: 1 }}>
                  <Text style={s.receiptLabel}>CUSTOMER</Text>
                  <Text style={s.receiptValue}>{receipt.customer_name || 'Walk-in customer'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.receiptLabel}>DATE</Text>
                  <Text style={s.receiptValue}>
                    {new Date(receipt.created_at || Date.now()).toLocaleString(undefined, {
                      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                  </Text>
                </View>
              </View>
              <View style={s.receiptTableHeader}>
                <Text style={[s.receiptColumn, { flex: 2 }]}>ITEM</Text>
                <Text style={[s.receiptColumn, { width: 34, textAlign: 'center' }]}>QTY</Text>
                <Text style={[s.receiptColumn, { flex: 1, textAlign: 'right' }]}>AMOUNT</Text>
              </View>
              {(receipt.items || []).map((item, index) => (
                <View key={`${item.product_id || item.product_name}-${index}`} style={s.receiptItemRow}>
                  <Text style={[s.receiptItemName, { flex: 2 }]}>{item.product_name}</Text>
                  <Text style={[s.receiptItemText, { width: 34, textAlign: 'center' }]}>{item.qty}</Text>
                  <Text style={[s.receiptItemAmount, { flex: 1, textAlign: 'right' }]}>
                    {fcfa(item.line_total ?? item.unit_price * item.qty)}
                  </Text>
                </View>
              ))}
              <View style={s.receiptTotal}>
                <Text style={s.receiptTotalLabel}>TOTAL DUE</Text>
                <Text style={s.receiptTotalValue}>{fcfa(receipt.total)}</Text>
              </View>
              <Text style={s.receiptSectionTitle}>PAYMENT DETAILS</Text>
              {(receipt.payments || []).map((payment, index) => (
                <View key={`${payment.method}-${index}`} style={s.receiptPaymentRow}>
                  <Text style={s.receiptItemText}>{payment.method}</Text>
                  <Text style={s.receiptItemAmount}>{fcfa(payment.amount)}</Text>
                </View>
              ))}
              <View style={s.receiptPaymentRow}>
                <Text style={s.receiptItemText}>Total paid</Text>
                <Text style={s.receiptItemAmount}>{fcfa(receipt.paid_amount)}</Text>
              </View>
              <View style={s.receiptBalance}>
                <Text style={s.receiptLabel}>{receipt.credit_amount > 0 ? 'BALANCE ON ACCOUNT' : 'BALANCE REMAINING'}</Text>
                <Text style={s.receiptBalanceValue}>{fcfa(receipt.credit_amount)}</Text>
              </View>
              <Text style={s.receiptThanks}>Thank you for choosing Manu’s Resto!</Text>
            </View>

            <View style={{ gap: 10, marginTop: 16 }}>
              <Btn variant="gold" icon="download-outline" title={receiptBusy ? 'Preparing PDF…' : 'Download PDF'} onPress={() => exportReceipt()} disabled={receiptBusy} />
              <Btn variant="ghost" icon="share-social-outline" title="Share PDF" onPress={() => exportReceipt(true)} disabled={receiptBusy} />
              <Btn variant="soft" icon="add-circle-outline" title="Start a new sale" onPress={() => setReceipt(null)} />
            </View>
          </View>
        )}
      </Sheet>

      <Modal visible={scannerOpen} animationType="slide" onRequestClose={() => setScannerOpen(false)}>
        <View style={{ flex: 1, backgroundColor: '#000' }}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'itf14', 'qr'] }}
          />
          <View style={s.scanOverlay} pointerEvents="box-none">
            <View style={s.scanHeader}>
              <Text style={s.scanTitle}>Scan a product barcode</Text>
              <Text style={s.scanSub}>Hold the code inside the frame</Text>
            </View>
            <View style={s.scanFrame}>
              <View style={[s.corner, { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 18 }]} />
              <View style={[s.corner, { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 18 }]} />
              <View style={[s.corner, { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 18 }]} />
              <View style={[s.corner, { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 18 }]} />
            </View>
            <Pressable onPress={() => setScannerOpen(false)} style={s.scanClose}>
              <Ionicons name="close" size={20} color={colors.forestDark} />
              <Text style={{ marginLeft: 8, fontWeight: '800', color: colors.forestDark, fontSize: 16 }}>Close scanner</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  scanBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', paddingHorizontal: 16 },
  tile: { width: '48.5%', backgroundColor: '#fff', borderRadius: radius.lg, padding: 12, marginBottom: 12, borderWidth: 2, borderColor: 'transparent', ...shadow },
  tileActive: { borderColor: colors.forest },
  tileTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  tileImage: { width: '100%', height: 92, borderRadius: radius.md, backgroundColor: colors.cream },
  tagOnImage: { position: 'absolute', top: 6, right: 6 },
  stockTag: { backgroundColor: colors.forestTint, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  stockTagText: { fontSize: 10, fontWeight: '800', color: colors.forest },
  tileName: { marginTop: 10, fontSize: 15, fontWeight: '700', color: colors.ink, minHeight: 36 },
  tileUnit: { fontSize: 12, color: colors.muted, marginTop: 2 },
  tileBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  tilePrice: { fontSize: 14, fontWeight: '800', color: colors.forest },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.forestTint, alignItems: 'center', justifyContent: 'center' },
  stepQty: { minWidth: 28, textAlign: 'center', fontWeight: '800', color: colors.ink, fontSize: 15 },
  cartBar: {
    position: 'absolute', left: 16, right: 16, bottom: 14, flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.forest, borderRadius: 20, padding: 12, ...shadow, shadowOpacity: 0.3,
  },
  cartCount: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' },
  cartCountText: { fontWeight: '900', color: colors.forestDark, fontSize: 16 },
  h: { fontSize: 13, fontWeight: '800', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8, marginTop: 20, marginBottom: 10 },
  fine: { color: colors.muted, fontSize: 12, marginTop: 8 },
  lineBlock: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  lineName: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink, paddingRight: 8 },
  lineTotal: { fontSize: 15, fontWeight: '800', color: colors.forest },
  lineControls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  priceBox: { flexDirection: 'row', alignItems: 'center' },
  priceCap: { fontSize: 12, color: colors.muted, fontWeight: '600', marginRight: 8 },
  priceInput: {
    width: 104, minHeight: 42, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, paddingHorizontal: 12,
    textAlign: 'right', fontSize: 16, fontWeight: '800', color: colors.ink, backgroundColor: colors.cream,
  },
  payRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  payInput: {
    width: 120, minHeight: 42, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, textAlign: 'right', fontSize: 16, fontWeight: '700', color: colors.ink, backgroundColor: colors.cream,
  },
  paymentTabs: { gap: 8, paddingBottom: 10 },
  paymentTab: {
    minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    paddingHorizontal: 12, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, backgroundColor: '#fff',
  },
  paymentTabActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  paymentTabText: { color: colors.ink, fontSize: 12, fontWeight: '700' },
  paymentTabTextActive: { color: '#fff' },
  creditTabContent: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 },
  fullAmountButton: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: colors.forestTint },
  fullAmountText: { color: colors.forest, fontSize: 12, fontWeight: '700' },
  summary: { marginTop: 16, borderRadius: radius.lg, padding: 14 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  sumLabel: { color: colors.muted, fontWeight: '600' },
  sumVal: { color: colors.ink, fontWeight: '800' },
  successBanner: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.okTint, borderRadius: radius.lg, padding: 14, marginBottom: 14 },
  scanOverlay: { ...StyleSheet.absoluteFillObject, justifyContent: 'space-between', alignItems: 'center', paddingTop: 70, paddingBottom: 50, paddingHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.25)' },
  scanHeader: { alignItems: 'center' },
  scanTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  scanSub: { color: 'rgba(255,255,255,0.8)', marginTop: 6, fontSize: 14 },
  scanFrame: { width: 260, height: 180 },
  corner: { position: 'absolute', width: 44, height: 44, borderColor: colors.gold },
  scanClose: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 22, height: 52, borderRadius: 26 },
  receiptPage: { margin: 2, padding: 18, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e8e3d8', borderRadius: 12 },
  receiptBrand: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, borderBottomWidth: 2, borderBottomColor: '#c49b3c' },
  receiptLogo: { width: 70, height: 70 },
  receiptEyebrow: { color: '#a47c22', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  receiptBrandName: { color: '#123a2b', fontSize: 22, fontWeight: '800', marginTop: 3 },
  receiptTagline: { color: '#69736d', fontSize: 9, letterSpacing: 0.7, marginTop: 3 },
  receiptTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 18, marginBottom: 12 },
  receiptTitle: { color: '#123a2b', fontSize: 18, fontWeight: '800' },
  receiptNumber: { color: '#89723a', fontSize: 10, fontWeight: '700', textAlign: 'right', flexShrink: 1 },
  receiptMeta: { flexDirection: 'row', gap: 10, padding: 11, backgroundColor: '#f6f5ef', borderRadius: 8, marginBottom: 16 },
  receiptLabel: { color: '#778078', fontSize: 8, fontWeight: '800', letterSpacing: 0.7, marginBottom: 4 },
  receiptValue: { color: '#202a23', fontSize: 11, fontWeight: '600' },
  receiptTableHeader: { flexDirection: 'row', alignItems: 'center', padding: 9, backgroundColor: '#123a2b', borderRadius: 5 },
  receiptColumn: { color: '#fff', fontSize: 9, fontWeight: '800' },
  receiptItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: '#eeeae1' },
  receiptItemName: { color: '#202a23', fontSize: 11, fontWeight: '600', paddingRight: 4 },
  receiptItemText: { color: '#626d65', fontSize: 10 },
  receiptItemAmount: { color: '#202a23', fontSize: 10, fontWeight: '700' },
  receiptTotal: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, padding: 12, backgroundColor: '#123a2b', borderRadius: 7 },
  receiptTotalLabel: { color: '#fff', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  receiptTotalValue: { color: '#fff', fontSize: 16, fontWeight: '800' },
  receiptSectionTitle: { color: '#123a2b', fontSize: 10, fontWeight: '800', marginTop: 18, marginBottom: 5 },
  receiptPaymentRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  receiptBalance: { marginTop: 10, padding: 11, backgroundColor: '#fff6e5', borderWidth: 1, borderColor: '#f1e4c7', borderRadius: 7 },
  receiptBalanceValue: { color: '#765516', fontSize: 16, fontWeight: '800' },
  receiptThanks: { color: '#123a2b', fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 18 },
});