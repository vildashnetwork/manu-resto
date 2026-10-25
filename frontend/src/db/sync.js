import * as FileSystem from 'expo-file-system/legacy';
import { uploadProductImage } from '../api/cloudinary';
import {
  backendRequest,
  createCustomerOnline,
  createProductOnline,
  addStockMovementOnline,
  recordRepaymentOnline,
  createSaleOnline,
  updateProductOnline,
  updateSalePaymentOnline,
  cancelSaleOnline,
  addExpenseOnline,
  updateSettingsOnline,
  downloadSnapshot,
} from '../api/repo';
import {
  getMeta, getOutbox, getRecord, listRecords, mapId, putRecord, removeOutbox, resolveId, setMeta, updateOutbox,
} from './index';

let running;

async function remoteImageUri(product) {
  const image = product.imageUrl || product.image_url || product.localImageUri;
  if (!image) throw new Error(`Product "${product.name}" has no image to upload.`);
  if (/^https:\/\//i.test(image)) return image;
  return uploadProductImage(image, `${product.id || 'product'}.jpg`, 'image/jpeg');
}

async function syncItem(item) {
  const payload = item.payload;
  switch (item.type) {
    case 'product.create': {
      const imageUrl = await remoteImageUri(payload.product);
      const remoteId = await createProductOnline({ ...payload.product, imageUrl }, payload.idempotencyKey);
      await mapId(payload.localId, remoteId);
      const local = await getRecord('products', payload.localId);
      if (local) await putRecord('products', { ...local, id: payload.localId, remoteId, imageUrl, _localPending: false });
      return;
    }
    case 'product.update': {
      const id = await resolveId(payload.localId);
      const current = await getRecord('products', payload.localId);
      const imageUrl = await remoteImageUri({ ...current, ...payload.product });
      await updateProductOnline(id, { ...payload.product, imageUrl });
      if (current) await putRecord('products', { ...current, imageUrl, _localPending: false });
      return;
    }
    case 'stock.move': {
      const productId = await resolveId(payload.productId);
      await addStockMovementOnline({ ...payload, productId });
      return;
    }
    case 'customer.create': {
      const remoteId = await createCustomerOnline(payload.customer, payload.idempotencyKey);
      await mapId(payload.localId, remoteId);
      const local = await getRecord('customers', payload.localId);
      if (local) await putRecord('customers', { ...local, id: payload.localId, remoteId, _localPending: false });
      return;
    }
    case 'payment.repayment': {
      await recordRepaymentOnline({ ...payload, customerId: await resolveId(payload.customerId) });
      return;
    }
    case 'sale.create': {
      const items = [];
      for (const itemData of payload.items) {
        items.push({ ...itemData, productId: await resolveId(itemData.productId) });
      }
      const result = await createSaleOnline({
        ...payload,
        items,
        customerId: payload.customerId ? await resolveId(payload.customerId) : null,
      });
      await mapId(payload.localId, result.sale.id);
      const local = await getRecord('sales', payload.localId);
      if (local) await putRecord('sales', {
        ...local, remoteId: result.sale.id, receipt_no: result.sale.receipt_no, _localPending: false,
      });
      return;
    }
    case 'sale.payment': {
      const saleId = await resolveId(payload.saleId);
      const sale = await updateSalePaymentOnline(saleId, payload.payment);
      const local = await getRecord('sales', payload.saleId);
      if (local) await putRecord('sales', { ...local, remoteId: sale.id, _localPending: false });
      return;
    }
    case 'sale.cancel': {
      await cancelSaleOnline(await resolveId(payload.saleId), payload.reason);
      return;
    }
    case 'expense.create': {
      await addExpenseOnline(payload);
      return;
    }
    case 'settings.update': {
      await updateSettingsOnline(payload);
      return;
    }
    default:
      throw new Error(`Unsupported sync operation: ${item.type}`);
  }
}

async function cacheProductImages(onProgress) {
  const products = await listRecords('products');
  const directory = `${FileSystem.documentDirectory}product-images/`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  let failures = 0;
  for (const product of products) {
    if (await getMeta('connectionMode', 'online') !== 'online') break;
    const imageUrl = product.imageUrl || product.image_url;
    if (!imageUrl || !/^https?:\/\//i.test(imageUrl) || product.localImageUri) continue;
    const extension = imageUrl.split('?')[0].match(/\.(png|webp|jpeg|jpg)$/i)?.[1] || 'jpg';
    const target = `${directory}${String(product.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;
    try {
      const result = await FileSystem.downloadAsync(imageUrl, target);
      if (result.status < 200 || result.status >= 300) throw new Error(`Image download failed (HTTP ${result.status}).`);
      await putRecord('products', { ...product, localImageUri: result.uri });
    } catch (error) {
      failures += 1;
      console.warn(`Could not cache image for ${product.name}`, error);
    } finally {
      await onProgress?.();
    }
  }
  await setMeta('imageCacheFailures', failures);
  return failures;
}

export async function syncNow({ refresh = false, cacheImages = false } = {}) {
  if (running) return running;
  running = (async () => {
    if (await getMeta('connectionMode', 'online') !== 'online') {
      throw new Error('Switch to Online mode before syncing.');
    }
    await setMeta('syncActive', 'true');
    await setMeta('syncError', '');
    try {
      const initialQueue = await getOutbox();
      const pending = [];
      for (const item of initialQueue) {
        if (item.status === 'failed') break;
        if (item.status === 'pending') pending.push(item);
      }
      const total = pending.length + (refresh ? 1 : 0);
      await setMeta('syncTotal', total);
      await setMeta('syncProcessed', '0');
      let processed = 0;
      for (const item of pending) {
        if (await getMeta('connectionMode', 'online') !== 'online') break;
        try {
          await syncItem(item);
          await removeOutbox(item.id);
          processed += 1;
          await setMeta('syncProcessed', processed);
        } catch (error) {
          await updateOutbox(item.id, 'failed', error.message || String(error));
          await setMeta('syncError', error.message || String(error));
          throw error;
        }
      }
      if (await getMeta('connectionMode', 'online') === 'online') {
        if (refresh) {
          await downloadSnapshot();
          processed += 1;
          await setMeta('syncProcessed', processed);
        }
        if (await getMeta('connectionMode', 'online') === 'online') {
          await setMeta('lastSyncAt', Date.now());
        }
      }
      await setMeta('syncProcessed', processed);
      return { processed, imageCacheFailures: Number(await getMeta('imageCacheFailures', '0')) };
    } catch (error) {
      await setMeta('syncError', error.message || String(error));
      throw error;
    } finally {
      await setMeta('syncActive', 'false');
    }
  })().finally(() => {
    running = null;
    Promise.all([getOutbox(), getMeta('connectionMode', 'online')]).then(([items, mode]) => {
      if (mode === 'online' && items.length && items[0].status === 'pending') {
        setTimeout(() => syncNow().catch((error) => console.warn('Background sync failed', error)), 0);
      }
    }).catch((error) => console.warn('Could not continue background sync', error));
  });
  return running;
}

export async function cacheImagesNow() {
  if (running) throw new Error('Another synchronization task is running. Try again when it finishes.');
  if (await getMeta('connectionMode', 'online') !== 'online') {
    throw new Error('Switch to Online mode to download product images.');
  }
  running = (async () => {
    await setMeta('syncActive', 'true');
    await setMeta('syncError', '');
    try {
      const products = await listRecords('products');
      const eligible = products.filter((product) => {
        const imageUrl = product.imageUrl || product.image_url;
        return !product.localImageUri && /^https?:\/\//i.test(imageUrl || '');
      });
      await setMeta('syncTotal', eligible.length);
      await setMeta('syncProcessed', '0');
      const failures = await cacheProductImages(async () => {
        const completed = Number(await getMeta('syncProcessed', '0')) + 1;
        await setMeta('syncProcessed', completed);
      });
      if (failures > 0) {
        throw new Error(`${failures} product image(s) could not be downloaded. Check your connection and try again.`);
      }
      return { cached: eligible.length };
    } catch (error) {
      await setMeta('syncError', error.message || String(error));
      throw error;
    } finally {
      await setMeta('syncActive', 'false');
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

export async function syncConnectivityCheck() {
  try {
    await backendRequest('/health');
    return true;
  } catch {
    return false;
  }
}
