npm install -g eas-cli
eas --version
eas login

eas build -p android --profile preview

eas build:configureonte

# Manu's Resto Manager (MVP)

Expo + React Native (JavaScript/JSX) + Expo Router. The app sends restaurant data to the Express API backed by MongoDB. The API base URL is centralized in `src/config/backend.ts`; by default it is `https://manu-ltx7.onrender.com/api`.

## Run

```bash
npm install
npx expo install --fix   # aligns package versions with your installed Expo SDK
npx expo start --dev-client
```

The configured logo splash screen is native app configuration. Expo Go shows its own launch screen, and over-the-air JavaScript updates cannot change the native splash assets. To see the branded splash on Android, build and install a fresh native app after changing `app.json` (for example, `npx expo run:android` with Android Studio set up, or an EAS Android build).

Barcode scanning uses VisionCamera and ZXing native modules, not Expo Camera or Google Play Services. Sales-book scanning uses on-device Google ML Kit text recognition. Expo Go does not include these native modules. The new architecture is enabled for Nitro Modules. Build and install a development client with `eas build --platform android --profile development`, then start Metro with `npm start`. For a standalone APK, build and install `eas build --platform android --profile preview`. A JavaScript reload or OTA update cannot add native modules to an already-built app.

Push notifications use Expo Notifications and the backend Expo Push Service. For Android, register an Android app in the Firebase project with package ID `com.manusresto.manager`, download its `google-services.json`, and place it at `frontend/google-services.json` before making an EAS build. `app.json` references this file; without it Firebase Messaging cannot initialize in the installed app. Also configure Firebase Cloud Messaging v1 credentials for the EAS project using `eas credentials --platform android`; the service-account JSON is a separate credential and must never be committed or shared. Deploy the backend changes as well as the APK. After installing the rebuilt APK, open **Settings → App push notifications → Enable on this device** and allow Android's permission prompt. While debt, low-stock, out-of-stock, or no-sales alerts are active, the backend sends one combined reminder every 10 minutes; Android may delay delivery for battery/network reasons.

## What is built (Phase 2 MVP)

- **Home**: today's sales, collected, credit sales, debt recovered, expenses, outstanding debt, low-stock warning, recent sales.
- **Sales**: searchable product grid, barcode scanning, adjustable checkout prices, mixed payments (Cash / MTN MoMo / Xcash / Orange Money / Bank transfer), partial payment with the rest on credit, credit-limit authorization, and branded printable/shareable receipts.
- **Customers**: profiles, editable customer debt and credit limit, customer deletion, opening debt (labelled as migrated), dated statement with running balance, and repayments (never counted as sales).
- **Stock**: searchable and filterable products with editable details and barcodes, tracked stock, purchases, wastage, damage, complimentary, adjustments, low-stock threshold, required Cloudinary images, and confirmed product deletion.
- **Reports**: preset, custom-range, or exact-day filters; on-device sales-book scanning with an editable review of recognized products, quantities, and unit prices; calculated totals and tracked-stock reductions shown before saving; explicit Save/Cancel; manual dated sales with searchable products, customer assignment, and payment amount; dated, editable, and deletable expenses; editable sale dates and payments; paginated PDF reports containing all sales in the selected period; downloadable, shareable, or printable customer receipts; paid/unpaid filters; sales vs collected vs credit vs debt recovered vs expenses kept separate; payment-method breakdown; expected cash; best sellers; gross profit estimate; cancellation.
- **Customer statements**: choose the calendar date for each repayment; the selected date appears in the statement and is used in reports.

On-device text recognition can misread handwritten entries. Review and correct every product, quantity, unit price, customer, and paid amount in the scan preview before saving. Line totals are calculated from quantity × unit price; written amount and page-total fields are ignored.

The branded app icon uses `public/bglogo.png`; Android adaptive icons use `public/nobglogo.png` over the restaurant green. Receipts embed the transparent logo so it prints consistently on web and native platforms.

## API contract expected by the frontend

Set `EXPO_PUBLIC_API_URL` to the API root if it differs from the default (include `/api` if that is your Express prefix). The frontend expects these JSON endpoints:

- `GET /products`, `POST /products`, `PUT /products/:id`, `DELETE /products/:id`
- `POST /stock/movements`
- `GET /customers`, `GET /customers/:id`, `POST /customers`, `PUT /customers/:id`, `DELETE /customers/:id`, `GET /customers/:id/statement`
- `POST /payments/repayments`
- `POST /sales`, `GET /sales?limit=&from=&to=`, `POST /sales/:id/cancel`, `PUT /sales/:id/payment`
- `POST /expenses`, `PUT /expenses/:id`, `DELETE /expenses/:id`, `GET /reports?from=&to=`
- `PUT /sales/:id/date` updates the sale date together with its payment, ledger, and stock-movement dates.

List responses may be a raw array or an object keyed by the resource name (or `data`). Single-record responses may be the record itself, under the resource name, or under `data`. Reports should provide the fields consumed by the Reports screen: totals/counts, `byMethod`, `topProducts`, and `expList`. Sale requests include `idempotencyKey`, `items`, `customerId`, `payments`, and `allowOverLimit`; manual dated sales also include `createdAt` as a Unix timestamp in milliseconds. Product requests include `imageUrl`.

The matching Express/MongoDB backend now lives in `../backend`; see its README for startup, MongoDB transaction requirements, and deployment configuration. The app does not connect to MongoDB directly; database credentials stay on the server.

## Product images

New food and drink products require a selected image. The app uploads it directly to Cloudinary using an unsigned preset, then saves the resulting secure URL with the product through the API. The defaults use the cloud name and preset supplied for this project. To override them, set `EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME` and `EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET` in the frontend environment. Never put the MongoDB connection string in frontend environment variables.
