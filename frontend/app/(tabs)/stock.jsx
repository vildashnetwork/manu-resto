import React, { useState } from 'react';
import { ScrollView, View, Text, Image, Alert, Pressable } from 'react-native';
import { Card, Btn, Chip, Field, Sheet, Row, useLoad, screenStyle, pad } from '../../src/components/ui';
import { getProducts, createProduct, addStockMovement } from '../../src/api/repo';
import { chooseAndUploadProductImage } from '../../src/api/cloudinary';
import { fcfa, parseAmount } from '../../src/utils';
import { colors } from '../../src/theme';

const CATEGORIES = ['Meals', 'Drinks', 'Snacks', 'Other'];
const MOVES = [
  { key: 'purchase', label: 'Purchase (+)', sign: 1 },
  { key: 'wastage', label: 'Wastage (−)', sign: -1 },
  { key: 'damage', label: 'Damage (−)', sign: -1 },
  { key: 'complimentary', label: 'Complimentary (−)', sign: -1 },
  { key: 'adjust_up', label: 'Adjust up (+)', sign: 1 },
  { key: 'adjust_down', label: 'Adjust down (−)', sign: -1 },
];
const EMPTY = { name: '', category: 'Meals', unit: '', price: '', cost: '', threshold: '', opening: '', tracked: false };

export default function Stock() {
  const [products, reload] = useLoad(getProducts);
  const [add, setAdd] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [move, setMove] = useState(null); // product being adjusted
  const [mType, setMType] = useState('purchase');
  const [mQty, setMQty] = useState('');
  const [mNote, setMNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState('');

  async function chooseImage() {
    if (busy) return;
    setBusy(true);
    try {
      const url = await chooseAndUploadProductImage();
      if (url) setImageUrl(url);
    } catch (e) {
      Alert.alert('Cannot upload image', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveProduct() {
    if (busy) return;
    if (!imageUrl) {
      Alert.alert('Product image required', 'Add an image for every food or drink before saving.');
      return;
    }
    setBusy(true);
    try {
      await createProduct({
        name: f.name, category: f.category, unit: f.unit, price: parseAmount(f.price), cost: parseAmount(f.cost),
        threshold: parseAmount(f.threshold), tracked: f.tracked, openingStock: parseAmount(f.opening), imageUrl,
      });
      setF(EMPTY); setImageUrl(''); setAdd(false); reload();
    } catch (e) {
      Alert.alert('Cannot save product', e.message);
    } finally { setBusy(false); }
  }

  async function saveMove() {
    if (busy) return;
    setBusy(true);
    try {
      const def = MOVES.find((m) => m.key === mType);
      await addStockMovement({ productId: move.id, type: mType, qty: def.sign * parseAmount(mQty), note: mNote });
      setMove(null); setMQty(''); setMNote(''); reload();
    } catch (e) {
      Alert.alert('Cannot save movement', e.message);
    } finally { setBusy(false); }
  }

  const list = products ?? [];

  return (
    <ScrollView style={screenStyle} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <Btn title="Add product" onPress={() => setAdd(true)} style={{ marginBottom: 12 }} />
      <Card>
        {list.map((p) => {
          const low = p.tracked && p.low_stock_threshold > 0 && p.stock <= p.low_stock_threshold;
          return (
            <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              {p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: 54, height: 54, borderRadius: 8, marginRight: 10 }} /> : null}
              <View style={{ flex: 1 }}>
                <Row
                  left={p.name}
                  sub={`${p.category} · ${p.unit} · cost ${fcfa(p.cost)}`}
                  right={fcfa(p.price)}
                  subRight={p.tracked ? `Stock ${p.stock}${low ? ' · LOW' : ''}` : 'Not tracked'}
                  onPress={p.tracked ? () => setMove(p) : undefined}
                />
              </View>
            </View>
          );
        })}
        {list.length === 0 && <Text style={{ color: colors.muted }}>No products yet.</Text>}
      </Card>
      <Text style={{ color: colors.muted, fontSize: 12, marginTop: 8 }}>Tap a tracked product to record a purchase, wastage, damage or adjustment.</Text>

      <Sheet visible={add} title="New product" onClose={() => setAdd(false)}>
        <Field label="Name *" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, rowGap: 8 }}>
          {CATEGORIES.map((c) => <Chip key={c} label={c} active={f.category === c} onPress={() => setF({ ...f, category: c })} />)}
        </View>
        <Field label="Unit (plate, bottle, crate…)" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} />
        <Field label="Selling price (FCFA) *" keyboardType="number-pad" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} />
        <Field label="Purchase cost (FCFA)" keyboardType="number-pad" value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} />
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Product image (required)</Text>
        {imageUrl ? <Image source={{ uri: imageUrl }} style={{ width: '100%', height: 180, borderRadius: 10, marginBottom: 10 }} /> : null}
        <Btn title={busy ? 'Uploading…' : imageUrl ? 'Choose a different image' : 'Choose and upload image'} variant="ghost" onPress={chooseImage} disabled={busy} style={{ marginBottom: 12 }} />
        <Pressable onPress={() => setF({ ...f, tracked: !f.tracked })} style={{ marginBottom: 12 }}>
          <Text style={{ color: colors.forest, fontWeight: '600' }}>{f.tracked ? '☑' : '☐'} Track stock quantity</Text>
        </Pressable>
        {f.tracked && (
          <>
            <Field label="Opening stock" keyboardType="number-pad" value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} />
            <Field label="Low-stock warning at" keyboardType="number-pad" value={f.threshold} onChangeText={(v) => setF({ ...f, threshold: v })} />
          </>
        )}
        <Btn title={busy ? 'Saving…' : 'Save product'} onPress={saveProduct} disabled={busy || !imageUrl} />
      </Sheet>

      <Sheet visible={!!move} title={move ? `${move.name} · stock ${move.stock}` : ''} onClose={() => setMove(null)}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, rowGap: 8 }}>
          {MOVES.map((m) => <Chip key={m.key} label={m.label} active={mType === m.key} onPress={() => setMType(m.key)} />)}
        </View>
        <Field label="Quantity" keyboardType="number-pad" value={mQty} onChangeText={setMQty} />
        <Field label="Note" value={mNote} onChangeText={setMNote} />
        <Btn title={busy ? 'Saving…' : 'Save movement'} onPress={saveMove} disabled={busy || parseAmount(mQty) <= 0} />
      </Sheet>
    </ScrollView>
  );
}
