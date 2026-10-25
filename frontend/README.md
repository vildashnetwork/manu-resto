# Manu's Resto Manager (MVP)

Expo + React Native (JavaScript/JSX) + Expo Router. The app sends restaurant data to the Express API backed by MongoDB. The API base URL is centralized in `src/config/backend.ts`; by default it is `https://manu.onrender.com/api`.

## Run

```bash
npm install
npx expo install --fix   # aligns package versions with your installed Expo SDK
npx expo start           # scan the QR code with Expo Go, or press "a" for Android
```

## What is built (Phase 2 MVP)

- **Home**: today's sales, collected, credit sales, debt recovered, expenses, outstanding debt, low-stock warning, recent sales.
- **Sales**: searchable product grid, cart, mixed payments (Cash / MTN MoMo / Orange Money / Bank transfer), partial payment with the rest on credit, remaining debt shown before confirming, credit-limit authorization.
- **Customers**: profiles, credit limit, opening debt (labelled as migrated), dated statement with running balance, repayments (never counted as sales).
- **Stock**: products with price, cost, tracked stock, purchases, wastage, damage, complimentary, adjustments, low-stock threshold, and required Cloudinary images.
- **Reports**: today / 7 days / this month; sales vs collected vs credit vs debt recovered vs expenses kept separate; payment-method breakdown; expected cash; best sellers; gross profit estimate; expenses; sales history with owner-only cancellation (reason required).

## API contract expected by the frontend

Set `EXPO_PUBLIC_API_URL` to the API root if it differs from the default (include `/api` if that is your Express prefix). The frontend expects these JSON endpoints:

- `GET /products`, `POST /products`, `PUT /products/:id`
- `POST /stock/movements`
- `GET /customers`, `GET /customers/:id`, `POST /customers`, `GET /customers/:id/statement`
- `POST /payments/repayments`
- `POST /sales`, `GET /sales?limit=&from=&to=`, `POST /sales/:id/cancel`
- `POST /expenses`, `GET /reports?from=&to=`

List responses may be a raw array or an object keyed by the resource name (or `data`). Single-record responses may be the record itself, under the resource name, or under `data`. Reports should provide the fields consumed by the Reports screen: totals/counts, `byMethod`, `topProducts`, and `expList`. Sale requests include `idempotencyKey`, `items`, `customerId`, `payments`, and `allowOverLimit`. Product requests include `imageUrl`.

The matching Express/MongoDB backend now lives in `../backend`; see its README for startup, MongoDB transaction requirements, and deployment configuration. The app does not connect to MongoDB directly; database credentials stay on the server.

## Product images

New food and drink products require a selected image. The app uploads it directly to Cloudinary using an unsigned preset, then saves the resulting secure URL with the product through the API. The defaults use the cloud name and preset supplied for this project. To override them, set `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` and `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in the frontend environment. Never put the MongoDB connection string in frontend environment variables.
