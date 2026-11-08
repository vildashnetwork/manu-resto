import { Image } from 'react-native';
import TextRecognition from '@react-native-ml-kit/text-recognition';

function imageSize(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(uri, (width, height) => resolve({ width, height }), reject);
  });
}

function plainText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function words(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
}

function matchProduct(text, products) {
  const wanted = plainText(text);
  if (!wanted) return null;
  const ranked = products.map((product) => {
    const name = plainText(product.name);
    if (name === wanted) return { product, score: 1 };
    if (name.includes(wanted) || wanted.includes(name)) return { product, score: 0.85 };
    const wantedWords = words(text);
    const productWords = new Set(words(product.name));
    const overlap = wantedWords.filter((word) => productWords.has(word)).length;
    return { product, score: overlap / Math.max(wantedWords.length, productWords.size, 1) };
  }).sort((a, b) => b.score - a.score);
  return ranked[0]?.score >= 0.6 && ranked[0].score > (ranked[1]?.score || 0)
    ? ranked[0].product
    : null;
}

function numberIn(text) {
  const digits = String(text || '').replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
}

function linePosition(line, width, height) {
  const frame = line.frame || {};
  const x = Number(frame.x ?? frame.left ?? 0);
  const y = Number(frame.y ?? frame.top ?? 0);
  const w = Number(frame.width ?? 0);
  const h = Number(frame.height ?? 0);
  return {
    x: (x + w / 2) / width,
    y: (y + h / 2) / height,
  };
}

function readRows(result, width, height) {
  const lines = (result.blocks || []).flatMap((block) =>
    (block.lines || []).map((line) => ({
      text: String(line.text || '').trim(),
      ...linePosition(line, width, height),
    }))
  ).filter((line) => line.text && Number.isFinite(line.x) && Number.isFinite(line.y));
  const header = lines.find((line) => /\b(product|produit)\b/i.test(line.text));
  if (!header) {
    throw new Error('Could not find the printed table headings. Retake the page flat, in good light, with the whole page visible.');
  }

  const dataLines = lines
    .filter((line) => line.y > header.y + 0.012 && line.y < 0.91)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const bands = [];
  for (const line of dataLines) {
    let band = bands[bands.length - 1];
    if (!band || line.y - band.y > 0.018) {
      band = { y: line.y, lines: [] };
      bands.push(band);
    }
    band.lines.push(line);
    band.y = band.lines.reduce((sum, item) => sum + item.y, 0) / band.lines.length;
  }

  return bands.map(({ lines: bandLines }) => {
    const cells = { number: [], product: [], qty: [], unitPrice: [], customer: [], paid: [], method: [] };
    for (const line of bandLines) {
      if (line.x < 0.095) cells.number.push(line.text);
      else if (line.x < 0.345) cells.product.push(line.text);
      else if (line.x < 0.405) cells.qty.push(line.text);
      else if (line.x < 0.51) cells.unitPrice.push(line.text);
      else if (line.x >= 0.62 && line.x < 0.81) cells.customer.push(line.text);
      else if (line.x >= 0.81 && line.x < 0.91) cells.paid.push(line.text);
      else if (line.x >= 0.91) cells.method.push(line.text);
    }
    const text = (cell) => cell.join(' ').trim();
    const productText = text(cells.product);
    const qty = numberIn(text(cells.qty));
    const unitPrice = numberIn(text(cells.unitPrice));
    if (!productText || qty === null || unitPrice === null) return null;
    return {
      saleNumber: text(cells.number).match(/\d+/)?.[0] || '',
      productText,
      product: null,
      qty,
      unitPrice,
      customerText: text(cells.customer),
      paid: numberIn(text(cells.paid)),
      methodCode: text(cells.method).toUpperCase().replace(/[^A-Z]/g, ''),
    };
  }).filter(Boolean);
}

function methodFor(code, methods) {
  const value = String(code || '').trim().toUpperCase();
  const methodCodes = { C: 'Cash', M: 'MTN MoMo', O: 'Orange Money' };
  const method = methodCodes[value] || code;
  return methods.includes(method) ? method : 'Cash';
}

function groupSales(rows, products, customers, methods, pageIndex) {
  const sales = [];
  for (const row of rows) {
    const previous = sales[sales.length - 1];
    const sale = row.saleNumber && previous?.ref === row.saleNumber ? previous : null;
    const product = matchProduct(row.productText, products);
    const customer = row.customerText
      ? customers.find((item) => plainText(item.name) === plainText(row.customerText))
      : null;
    const line = {
      productId: product?.id || null,
      text: row.productText,
      qty: row.qty,
      unitPrice: row.unitPrice,
    };
    if (sale) {
      sale.lines.push(line);
      if (row.customerText) {
        sale.customerText = row.customerText;
        sale.customerId = customer?.id || '';
      }
      if (row.paid !== null) sale.paid = row.paid;
      if (row.methodCode) sale.method = methodFor(row.methodCode, methods);
    } else {
      sales.push({
        ref: row.saleNumber || `${pageIndex + 1}-${sales.length + 1}`,
        lines: [line],
        customerText: row.customerText,
        customerId: customer?.id || '',
        paid: row.paid || 0,
        method: methodFor(row.methodCode, methods),
      });
    }
  }
  return sales;
}

export async function scanBookPages({ pages, products, customers, methods }) {
  const pagesRead = await Promise.all(pages.map(async (uri, pageIndex) => {
    const [result, size] = await Promise.all([
      TextRecognition.recognize(uri),
      imageSize(uri),
    ]);
    return groupSales(readRows(result, size.width, size.height), products, customers, methods, pageIndex);
  }));
  return pagesRead.flat();
}

export { matchProduct };
