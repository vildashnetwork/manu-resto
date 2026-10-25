import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const apiBase = (process.env.API_BASE_URL || 'https://manu-ltx7.onrender.com/api').replace(/\/+$/, '');
const dryRun = process.argv.includes('--dry-run');
const confirmed = process.argv.includes('--yes');
const seedPath = new URL('../data/mock-meals.json', import.meta.url);
const products = JSON.parse(await readFile(fileURLToPath(seedPath), 'utf8'));

if (!dryRun && !confirmed) {
  console.error('Refusing to write products without an explicit confirmation.');
  console.error('Preview the meals, then run: npm run seed:meals -- --yes');
  process.exitCode = 1;
} else {
  if (!Array.isArray(products) || products.length === 0) {
    throw new Error('The mock meals catalog is empty or invalid.');
  }

  for (const product of products) {
    if (
      typeof product.name !== 'string' ||
      product.category !== 'Meals' ||
      !Number.isSafeInteger(product.price) ||
      product.price <= 0 ||
      !/^https:\/\//i.test(product.imageUrl)
    ) {
      throw new Error(`Invalid mock meal entry: ${product.name || 'unnamed product'}`);
    }
  }

  const listResponse = await fetch(`${apiBase}/products`, {
    headers: { Accept: 'application/json' },
  });
  const listPayload = await listResponse.json();
  if (!listResponse.ok) {
    throw new Error(listPayload.message || `Could not read products (${listResponse.status}).`);
  }

  const existing = Array.isArray(listPayload)
    ? listPayload
    : listPayload.products ?? listPayload.data;
  if (!Array.isArray(existing)) {
    throw new Error('The products endpoint returned an unexpected response.');
  }

  const existingNames = new Set(
    existing.map((product) => product.name?.trim().toLocaleLowerCase()).filter(Boolean)
  );
  const pending = products.filter(
    (product) => !existingNames.has(product.name.trim().toLocaleLowerCase())
  );

  console.log(`API: ${apiBase}`);
  console.log(`Catalog contains ${products.length} mock meals.`);
  console.log(`${existing.length} products already exist; ${pending.length} meals ${dryRun ? 'would be added' : 'will be added'}.`);
  console.log('Meal prices and images are mock examples. Opening stock is 12 plates per meal.');

  if (dryRun) {
    for (const product of pending) {
      console.log(`DRY RUN ${product.name}: ${product.price} FCFA, stock 12`);
    }
  } else {
    let created = 0;
    const failures = [];

    for (const product of pending) {
      try {
        const response = await fetch(`${apiBase}/products`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...product,
            cost: 0,
            tracked: true,
            openingStock: 12,
          }),
        });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.message || `API request failed (${response.status})`);
        }
        const saved = payload.product ?? payload.data ?? payload;
        console.log(`CREATED ${product.name} [${saved.id ?? saved._id ?? 'saved'}]`);
        existingNames.add(product.name.trim().toLocaleLowerCase());
        created += 1;
      } catch (error) {
        failures.push({ name: product.name, message: error.message });
        console.error(`FAILED ${product.name}: ${error.message}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    console.log(`Finished: ${created} created, ${existing.length + created} total products before errors.`);
    if (failures.length) process.exitCode = 1;
  }
}
