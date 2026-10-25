# Manu's Resto API

Express and MongoDB backend for the Expo frontend in `../frontend`.

## Run locally

1. Install dependencies: `npm install`
2. Keep the existing `backend/.env` and set `MONGOURI` to the MongoDB connection string.
3. Set `CORS_ORIGIN` to the frontend origin(s), comma-separated. Expo development commonly uses `http://localhost:8081`.
4. Start the server with `npm run dev` (or `npm start`).
5. Check `http://localhost:3000/api/health`.

The frontend currently uses `https://manu-ltx7.onrender.com/api`. For local development set `EXPO_PUBLIC_API_URL=http://localhost:3000/api` in the frontend environment.

## Seed mock drinks

`data/mock-drinks.json` is an example catalog with drink images, sample FCFA retail prices, and 12 opening units per product. The names and images are based on public beverage catalogs where available; prices are mock values, not verified current shop prices. “Planet Energy Drink” is a mock catalog entry and should be replaced if it does not match the actual product you sell.

The seed script targets `https://manu-ltx7.onrender.com/api` by default. Review the list and preview its actions first:

```bash
npm run seed:drinks -- --dry-run
npm run seed:drinks -- --yes
```

It skips exact product-name matches already returned by `GET /products`, uploads each new product through `POST /products`, and stops on API read errors. Set `API_BASE_URL` to use another API deployment. The current API does not store manufacturer barcodes, so this sample does not make package barcode scanning available.

## Seed mock meals

`data/mock-meals.json` contains Achu with Yellow Soup, Fufu and Vegetables, Conchaf Rice, Eru, and Water Fufu. The images and FCFA prices are mock examples; confirm them against your actual menu before using them for sales. Each new meal is tracked with 12 opening plates.

```bash
npm run seed:meals -- --dry-run
npm run seed:meals -- --yes
```

The uploader uses `API_BASE_URL` or defaults to `https://manu-ltx7.onrender.com/api`, skips exact product-name matches, and sends products to `POST /products`.

## Endpoints

- `GET /api/health`
- `GET|POST /api/products`, `PUT /api/products/:id`
- `POST /api/stock/movements`
- `GET|POST /api/customers`, `GET /api/customers/:id`, `GET /api/customers/:id/statement`
- `POST /api/payments/repayments`
- `POST|GET /api/sales`, `POST /api/sales/:id/cancel`
- `POST /api/expenses`
- `GET /api/reports`

Sale and repayment writes use MongoDB transactions. Use a MongoDB replica set or Atlas deployment that supports transactions. Product images are uploaded by the frontend to Cloudinary; this API stores the secure image URL, not the image file.

## Deployment

Set `MONGOURI`, `PORT` (provided by the host), and `CORS_ORIGIN` in the backend service environment. Never use the MongoDB URL in the frontend. Configure the frontend API base URL separately if the deployed service or API prefix changes.

This MVP API does not implement user authentication or roles. Do not expose write endpoints publicly until authentication and authorization are added.
