npm install -g eas-cli
eas --version
eas login

eas build --platform android --profile preview

# Manu's Resto Manager (MVP)

Expo + React Native (JavaScript/JSX) + Expo Router. The app sends restaurant data to the Express API backed by MongoDB. The API base URL is centralized in `src/config/backend.ts`; by default it is `https://manu-ltx7.onrender.com/api`.

## Run

```bash
npm install
npx expo install --fix   # aligns package versions with your installed Expo SDK
npx expo start --dev-client
```

The configured logo splash screen is native app configuration. Expo Go shows its own launch screen, and over-the-air JavaScript updates cannot change the native splash assets. To see the branded splash on Android, build and install a fresh native app after changing `app.json` (for example, `npx expo run:android` with Android Studio set up, or an EAS Android build).

Barcode scanning uses VisionCamera and ZXing native modules, not Expo Camera or Google Play Services. Expo Go does not include these native modules. The new architecture is enabled for Nitro Modules. Build and install a development client with `eas build --platform android --profile development`, then start Metro with `npm start`. For a standalone APK, build and install `eas build --platform android --profile preview`. A JavaScript reload or OTA update cannot add native modules to an already-built app.

## What is built (Phase 2 MVP)

- **Home**: today's sales, collected, credit sales, debt recovered, expenses, outstanding debt, low-stock warning, recent sales.
- **Sales**: searchable product grid, barcode scanning, adjustable checkout prices, mixed payments (Cash / MTN MoMo / Xcash / Orange Money / Bank transfer), partial payment with the rest on credit, credit-limit authorization, and branded printable/shareable receipts.
- **Customers**: profiles, credit limit, opening debt (labelled as migrated), dated statement with running balance, repayments (never counted as sales).
- **Stock**: searchable and filterable products with editable details and barcodes, tracked stock, purchases, wastage, damage, complimentary, adjustments, low-stock threshold, and required Cloudinary images.
- **Reports**: preset or custom date ranges; paid/unpaid filters; sales vs collected vs credit vs debt recovered vs expenses kept separate; payment-method breakdown; expected cash; best sellers; gross profit estimate; expenses; editable sale payment records and cancellation.

The branded app icon uses `public/bglogo.png`; Android adaptive icons use `public/nobglogo.png` over the restaurant green. Receipts embed the transparent logo so it prints consistently on web and native platforms.

## API contract expected by the frontend

Set `EXPO_PUBLIC_API_URL` to the API root if it differs from the default (include `/api` if that is your Express prefix). The frontend expects these JSON endpoints:

- `GET /products`, `POST /products`, `PUT /products/:id`
- `POST /stock/movements`
- `GET /customers`, `GET /customers/:id`, `POST /customers`, `GET /customers/:id/statement`
- `POST /payments/repayments`
- `POST /sales`, `GET /sales?limit=&from=&to=`, `POST /sales/:id/cancel`, `PUT /sales/:id/payment`
- `POST /expenses`, `GET /reports?from=&to=`

List responses may be a raw array or an object keyed by the resource name (or `data`). Single-record responses may be the record itself, under the resource name, or under `data`. Reports should provide the fields consumed by the Reports screen: totals/counts, `byMethod`, `topProducts`, and `expList`. Sale requests include `idempotencyKey`, `items`, `customerId`, `payments`, and `allowOverLimit`. Product requests include `imageUrl`.

The matching Express/MongoDB backend now lives in `../backend`; see its README for startup, MongoDB transaction requirements, and deployment configuration. The app does not connect to MongoDB directly; database credentials stay on the server.

## Product images

New food and drink products require a selected image. The app uploads it directly to Cloudinary using an unsigned preset, then saves the resulting secure URL with the product through the API. The defaults use the cloud name and preset supplied for this project. To override them, set `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` and `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in the frontend environment. Never put the MongoDB connection string in frontend environment variables.
