import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Image, Alert, Pressable, StyleSheet, Modal, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { scanWithGooglePlayServices } from '../../src/api/barcodeScanner';
import {
  Hero, Card, Btn, Chip, Field, SearchBox, Sheet, IconDot, Pill, Empty, Fab, useLoad, ScreenShimmer, screenStyle, body,
} from '../../src/components/ui';
import { getProducts, createProduct, updateProduct, addStockMovement } from '../../src/api/repo';
import { chooseAndUploadProductImage } from '../../src/api/cloudinary';
import { fcfa, parseAmount } from '../../src/utils';
import { colors, CATEGORY_ICONS, radius, shadow } from '../../src/theme';

const CATEGORIES = ['Meals', 'Drinks', 'Snacks', 'Other'];
const MOVES = [
  { key: 'purchase', label: 'Purchase', sign: 1, icon: 'add-circle-outline' },
  { key: 'adjust_up', label: 'Adjust up', sign: 1, icon: 'arrow-up-circle-outline' },
  { key: 'wastage', label: 'Wastage', sign: -1, icon: 'trash-outline' },
  { key: 'damage', label: 'Damage', sign: -1, icon: 'hammer-outline' },
  { key: 'complimentary', label: 'Complimentary', sign: -1, icon: 'gift-outline' },
  { key: 'adjust_down', label: 'Adjust down', sign: -1, icon: 'arrow-down-circle-outline' },
];
const EMPTY = { name: '', category: 'Meals', unit: '', price: '', cost: '', threshold: '', opening: '', tracked: false, barcode: '' };

export default function Stock() {
  const [products, reload, loading] = useLoad(getProducts);
  const [add, setAdd] = useState(false);
  const [editing, setEditing] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [move, setMove] = useState(null); // product being adjusted
  const [mType, setMType] = useState('purchase');
  const [mQty, setMQty] = useState('');
  const [mNote, setMNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [imageUrl, setImageUrl] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [outOfStockOnly, setOutOfStockOnly] = useState(false);
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [barcodeScanAction, setBarcodeScanAction] = useState('assign');
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();

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
    if (!imageUrl && !editing) {
      Alert.alert('Product image required', 'Add an image for every food or drink before saving.');
      return;
    }
    setBusy(true);
    try {
      const product = {
        name: f.name, category: f.category, unit: f.unit, price: parseAmount(f.price), cost: parseAmount(f.cost),
        threshold: parseAmount(f.threshold), tracked: f.tracked, openingStock: parseAmount(f.opening), imageUrl, barcode: f.barcode,
      };
      if (editing) {
        await updateProduct(editing.id, product);
        if (editing.tracked) {
          const quantityChange = parseAmount(f.quantity) - Number(editing.stock || 0);
          if (quantityChange !== 0) {
            await addStockMovement({
              productId: editing.id,
              type: quantityChange > 0 ? 'adjust_up' : 'adjust_down',
              qty: quantityChange,
              note: 'Quantity updated from product editor',
            });
          }
        }
      } else await createProduct(product);
      setF(EMPTY); setImageUrl(''); setAdd(false); setEditing(null); reload();
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

  function editProduct(product) {
    setEditing(product);
    setF({
      name: product.name,
      category: product.category,
      unit: product.unit,
      price: String(product.price),
      cost: String(product.cost || 0),
      threshold: String(product.low_stock_threshold || 0),
      opening: '',
      quantity: String(Math.max(0, Number(product.stock) || 0)),
      tracked: product.tracked,
      barcode: product.barcode || '',
    });
    setImageUrl(product.image_url || '');
    setAdd(true);
  }

  function newProduct() {
    setEditing(null);
    setF(EMPTY);
    setImageUrl('');
    setAdd(true);
  }

  async function openBarcodeScanner(action = 'assign') {
    if (!cameraPermission?.granted) {
      const permission = await requestCameraPermission();
      if (!permission.granted) {
        Alert.alert('Camera permission required', 'Allow camera access to scan a product barcode.');
        return;
      }
    }
    setBarcodeScanAction(action);

    const useModernScanner =
      Platform.OS === 'android' && CameraView.isModernBarcodeScannerAvailable;

    if (useModernScanner) {
      try {
        await scanWithGooglePlayServices((result) => onBarcodeScanned(result, action));
        return;
      } catch (error) {
        // Google Play Services scanner unavailable at runtime; fall back to the
        // inline camera scanner, which works without Google Play Services.
      }
    }

    setBarcodeScannerOpen(true);
  }

  function onBarcodeScanned({ data }, action = barcodeScanAction) {
    const barcode = String(data || '').trim();
    if (!barcode) return;
    setBarcodeScannerOpen(false);
    if (action === 'edit') {
      const product = allProducts.find(
        (item) => item.barcode?.trim().toLowerCase() === barcode.toLowerCase()
      );
      if (!product) {
        Alert.alert('Product not found', `No product is assigned to barcode ${barcode}.`);
        return;
      }
      editProduct(product);
      return;
    }
    const duplicate = allProducts.find(
      (product) => product.id !== editing?.id && product.barcode?.trim().toLowerCase() === barcode.toLowerCase()
    );
    if (duplicate) {
      Alert.alert('Barcode already in use', `${duplicate.name} already has this barcode. Scan another barcode or edit that product.`);
      return;
    }
    setF((current) => ({ ...current, barcode }));
  }

  function openMove(product) {
    setMove(product);
    setMType('purchase');
  }

  const allProducts = products ?? [];
  const categories = useMemo(() => ['All', ...Array.from(new Set(allProducts.map((p) => p.category)))], [allProducts]);
  const list = allProducts.filter((p) =>
    (category === 'All' || p.category === category) &&
    (!outOfStockOnly || (p.tracked && p.stock <= 0)) &&
    (p.name + ' ' + (p.barcode || '')).toLowerCase().includes(search.trim().toLowerCase())
  );
  const tracked = allProducts.filter((p) => p.tracked);
  const outOfStockCount = tracked.filter((p) => p.stock <= 0).length;
  const lowCount = tracked.filter((p) => p.low_stock_threshold > 0 && p.stock <= p.low_stock_threshold).length;

  if (loading && !products) return <ScreenShimmer variant="list" />;

  return (
    <View style={screenStyle}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 110 }}>
        <Hero eyebrow="Menu and inventory" title="Stock">
          <View style={s.heroRow}>
            <View style={s.heroBox}><Text style={s.heroNum}>{allProducts.length}</Text><Text style={s.heroCap}>Products</Text></View>
            <View style={s.heroBox}><Text style={s.heroNum}>{tracked.length}</Text><Text style={s.heroCap}>Tracked</Text></View>
            <View style={[s.heroBox, lowCount > 0 && { backgroundColor: 'rgba(255,138,117,0.28)' }]}>
              <Text style={s.heroNum}>{lowCount}</Text><Text style={s.heroCap}>Low stock</Text>
            </View>
          </View>
        </Hero>

        <View style={body}>
          <View style={s.stockSearchRow}>
            <SearchBox value={search} onChangeText={setSearch} placeholder="Search products or barcode…" style={{ flex: 1 }} />
            <Pressable
              onPress={() => openBarcodeScanner('edit')}
              style={({ pressed }) => [s.scanStockButton, { opacity: pressed ? 0.78 : 1 }]}
              accessibilityRole="button"
              accessibilityLabel="Scan barcode to edit product"
            >
              <Ionicons name="barcode-outline" size={21} color={colors.forest} />
              <Text style={s.scanStockText}>Scan</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12, marginBottom: 6 }}>
            {categories.map((c) => (
              <Chip key={c} label={c} icon={c === 'All' ? 'apps-outline' : CATEGORY_ICONS[c] || 'pricetag-outline'} active={category === c} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }}>
            <Chip
              label={`Out of stock · ${outOfStockCount}`}
              icon="alert-circle-outline"
              active={outOfStockOnly}
              onPress={() => setOutOfStockOnly((current) => !current)}
            />
          </ScrollView>

          {list.map((p) => {
            const low = p.tracked && p.low_stock_threshold > 0 && p.stock <= p.low_stock_threshold;
            const out = p.tracked && p.stock <= 0;
            return (
              <View key={p.id} style={s.item}>
                <Pressable onPress={p.tracked ? () => openMove(p) : undefined} style={s.itemMain}>
                  {p.image_url ? (
                    <Image source={{ uri: p.image_url }} style={s.thumb} />
                  ) : (
                    <View style={[s.thumb, s.thumbEmpty]}>
                      <Ionicons name={CATEGORY_ICONS[p.category] || 'pricetag-outline'} size={26} color={colors.forestMid} />
                    </View>
                  )}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={s.name} numberOfLines={1}>{p.name}</Text>
                    <Text style={s.sub} numberOfLines={1}>{p.category} · {p.unit || 'unit'} · cost {fcfa(p.cost)}</Text>
                    {p.barcode ? (
                      <View style={s.barcodeRow}>
                        <Ionicons name="barcode-outline" size={14} color={colors.muted} />
                        <Text style={s.barcodeText} numberOfLines={1}>{p.barcode}</Text>
                      </View>
                    ) : null}
                    <View style={s.priceRow}>
                      <Text style={s.price}>{fcfa(p.price)}</Text>
                      <Pill
                        tone={!p.tracked ? 'neutral' : out ? 'danger' : low ? 'warn' : 'ok'}
                        label={!p.tracked ? 'Not tracked' : out ? 'Out of stock' : low ? `Low · ${p.stock}` : `${p.stock} in stock`}
                      />
                    </View>
                  </View>
                </Pressable>
                <View style={s.actions}>
                  <Btn small variant="soft" icon="create-outline" title="Edit" style={{ flex: 1 }} onPress={() => editProduct(p)} />
                  {p.tracked ? (
                    <Btn small variant="soft" icon="swap-vertical-outline" title="Adjust stock" style={{ flex: 1.4 }} onPress={() => openMove(p)} />
                  ) : null}
                </View>
              </View>
            );
          })}
          {list.length === 0 && (
            <Card>
              <Empty
                icon={outOfStockOnly ? 'checkmark-circle-outline' : 'cube-outline'}
                title={outOfStockOnly ? 'No out-of-stock products' : 'No products found'}
                hint={outOfStockOnly ? 'All tracked products currently have stock.' : 'Tap + Product to add a food or drink.'}
              />
            </Card>
          )}
        </View>
      </ScrollView>

      <Fab label="Product" onPress={newProduct} />

      <Sheet visible={add} tall title={editing ? `Edit ${editing.name}` : 'New product'} onClose={() => { setAdd(false); setEditing(null); }}>
        <Text style={s.label}>Product image {editing ? '' : '(required)'}</Text>
        <Pressable onPress={chooseImage} disabled={busy} style={({ pressed }) => [s.imagePicker, { opacity: pressed || busy ? 0.8 : 1 }]}>
          {imageUrl ? (
            <>
              <Image source={{ uri: imageUrl }} style={s.imagePreview} />
              <View style={s.imageBadge}>
                <Ionicons name="camera" size={16} color="#fff" />
                <Text style={s.imageBadgeText}>{busy ? 'Uploading…' : 'Change image'}</Text>
              </View>
            </>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <IconDot name={busy ? 'cloud-upload-outline' : 'camera-outline'} size={52} />
              <Text style={s.imageTitle}>{busy ? 'Uploading…' : 'Add a photo'}</Text>
              <Text style={s.imageHint}>Choose a clear picture of the food or drink</Text>
            </View>
          )}
        </Pressable>

        <Field label="Name *" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Text style={s.label}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14, rowGap: 8 }}>
          {CATEGORIES.map((c) => <Chip key={c} icon={CATEGORY_ICONS[c]} label={c} active={f.category === c} onPress={() => setF({ ...f, category: c })} />)}
        </View>
        <Field label="Unit (plate, bottle, crate…)" value={f.unit} onChangeText={(v) => setF({ ...f, unit: v })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Selling price *" keyboardType="number-pad" value={f.price} onChangeText={(v) => setF({ ...f, price: v })} />
          <Field style={{ flex: 1 }} label="Purchase cost" keyboardType="number-pad" value={f.cost} onChangeText={(v) => setF({ ...f, cost: v })} />
        </View>
        <View style={s.barcodeFieldHeader}>
          <Text style={s.label}>Barcode (optional)</Text>
          <Pressable
            onPress={openBarcodeScanner}
            style={({ pressed }) => [s.scanBarcodeButton, { opacity: pressed ? 0.75 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Scan product barcode"
          >
            <Ionicons name="barcode-outline" size={18} color={colors.forest} />
            <Text style={s.scanBarcodeText}>Scan barcode</Text>
          </Pressable>
        </View>
        <Field value={f.barcode} onChangeText={(v) => setF({ ...f, barcode: v })} autoCapitalize="none" placeholder="Scan or type barcode" />
        {editing && (
          <Field label="Low-stock warning at" keyboardType="number-pad" value={f.threshold} onChangeText={(v) => setF({ ...f, threshold: v })} />
        )}
        {editing?.tracked && (
          <Field
            label={`Current quantity${editing.unit ? ` (${editing.unit})` : ''}`}
            keyboardType="number-pad"
            value={f.quantity}
            onChangeText={(v) => setF({ ...f, quantity: v })}
            placeholder="Enter the counted quantity"
          />
        )}
        {!editing && (
          <Pressable onPress={() => setF({ ...f, tracked: !f.tracked })} style={s.toggle}>
            <Ionicons name={f.tracked ? 'checkbox' : 'square-outline'} size={24} color={colors.forest} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: colors.ink, fontWeight: '700' }}>Track stock quantity</Text>
              <Text style={{ color: colors.muted, fontSize: 12, marginTop: 2 }}>Turn on for drinks and items you count</Text>
            </View>
          </Pressable>
        )}
        {!editing && f.tracked && (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Field style={{ flex: 1 }} label="Opening stock" keyboardType="number-pad" value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} />
            <Field style={{ flex: 1 }} label="Warn when ≤" keyboardType="number-pad" value={f.threshold} onChangeText={(v) => setF({ ...f, threshold: v })} />
          </View>
        )}
        <Btn
          variant="gold"
          icon="checkmark-circle"
          title={busy ? 'Please wait…' : editing ? 'Save changes' : 'Save product'}
          onPress={saveProduct}
          disabled={busy || (!imageUrl && !editing)}
          style={{ marginTop: 6 }}
        />
      </Sheet>

      <Sheet visible={!!move} title={move ? move.name : ''} onClose={() => setMove(null)}>
        {move && (
          <Card style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <View>
              <Text style={s.label}>In stock</Text>
              <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>{move.stock}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={s.label}>Per {move.unit || 'unit'}</Text>
              <Text style={{ fontSize: 16, fontWeight: '700', color: colors.forest }}>{fcfa(move.price)}</Text>
            </View>
          </Card>
        )}
        <Text style={s.label}>What happened?</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 14 }}>
          {MOVES.map((m) => (
            <Chip key={m.key} icon={m.icon} label={`${m.sign > 0 ? '+' : '−'} ${m.label}`} active={mType === m.key} onPress={() => setMType(m.key)} />
          ))}
        </View>
        <Field label="Quantity" keyboardType="number-pad" value={mQty} onChangeText={setMQty} inputStyle={{ fontSize: 22, fontWeight: '800', minHeight: 58 }} />
        <Field label="Note" value={mNote} onChangeText={setMNote} />
        <Btn variant="gold" icon="checkmark-circle" title={busy ? 'Saving…' : 'Save movement'} onPress={saveMove} disabled={busy || parseAmount(mQty) <= 0} />
      </Sheet>

      <Modal visible={barcodeScannerOpen} animationType="slide" onRequestClose={() => setBarcodeScannerOpen(false)}>
        <View style={s.scanner}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            autofocus="on"
            onBarcodeScanned={onBarcodeScanned}
            barcodeScannerSettings={{ barcodeTypes: ['aztec', 'ean13', 'ean8', 'qr', 'pdf417', 'upc_e', 'datamatrix', 'code39', 'code93', 'itf14', 'codabar', 'code128', 'upc_a'] }}
            onMountError={(event) => Alert.alert('Camera unavailable', event.message)}
          />
          <View style={s.scannerHeader}>
            <Text style={s.scannerTitle}>Scan product barcode</Text>
            <Text style={s.scannerHint}>Hold the barcode inside the frame</Text>
          </View>
          <View pointerEvents="none" style={s.scannerFrame}>
            <View style={[s.scannerCorner, s.scannerTopLeft]} />
            <View style={[s.scannerCorner, s.scannerTopRight]} />
            <View style={[s.scannerCorner, s.scannerBottomLeft]} />
            <View style={[s.scannerCorner, s.scannerBottomRight]} />
          </View>
          <Pressable onPress={() => setBarcodeScannerOpen(false)} style={s.scannerClose}>
            <Ionicons name="close" size={20} color={colors.forest} />
            <Text style={s.scannerCloseText}>Cancel scan</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  stockSearchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanStockButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.forestTint, backgroundColor: colors.forestTint },
  scanStockText: { color: colors.forest, fontSize: 13, fontWeight: '700' },
  heroRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  heroBox: { flex: 1, backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: radius.md, padding: 12 },
  heroNum: { color: '#fff', fontSize: 26, fontWeight: '800' },
  heroCap: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: '600', marginTop: 2 },

  item: { backgroundColor: '#fff', borderRadius: radius.lg, padding: 12, marginTop: 10, ...shadow },
  itemMain: { flexDirection: 'row', alignItems: 'center' },
  thumb: { width: 72, height: 72, borderRadius: 14, backgroundColor: colors.cream },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.forestTint },
  name: { fontSize: 16, fontWeight: '800', color: colors.ink },
  sub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  barcodeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  barcodeText: { fontSize: 11, color: colors.muted, marginLeft: 4, flex: 1 },
  barcodeFieldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scanBarcodeButton: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 8, borderRadius: radius.sm, backgroundColor: colors.forestTint },
  scanBarcodeText: { color: colors.forest, fontSize: 12, fontWeight: '700' },
  priceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  price: { fontSize: 15, fontWeight: '800', color: colors.forest },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },

  label: { fontSize: 13, color: colors.muted, marginBottom: 8, fontWeight: '600' },
  imagePicker: {
    minHeight: 150, borderRadius: radius.lg, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#CFC7B1',
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginBottom: 16,
  },
  imagePreview: { width: '100%', height: 190 },
  imageBadge: {
    position: 'absolute', right: 10, bottom: 10, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(15,42,32,0.85)', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
  },
  imageBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13, marginLeft: 6 },
  imageTitle: { marginTop: 10, fontSize: 15, fontWeight: '800', color: colors.ink },
  imageHint: { marginTop: 2, fontSize: 12, color: colors.muted },
  toggle: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: radius.md, padding: 14, marginBottom: 14 },
  scanner: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between', alignItems: 'center', paddingTop: 64, paddingBottom: 44 },
  scannerHeader: { alignItems: 'center', paddingHorizontal: 24 },
  scannerTitle: { color: '#fff', fontSize: 21, fontWeight: '800' },
  scannerHint: { color: 'rgba(255,255,255,0.82)', fontSize: 14, marginTop: 7 },
  scannerFrame: { width: 280, height: 190 },
  scannerCorner: { position: 'absolute', width: 42, height: 42, borderColor: colors.gold },
  scannerTopLeft: { top: 0, left: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  scannerTopRight: { top: 0, right: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  scannerBottomLeft: { bottom: 0, left: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  scannerBottomRight: { bottom: 0, right: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  scannerClose: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 20, minHeight: 48, borderRadius: 24 },
  scannerCloseText: { color: colors.forest, fontWeight: '700' },
});