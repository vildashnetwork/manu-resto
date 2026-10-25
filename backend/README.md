# Manu's Resto API

Express and MongoDB backend for the Expo frontend in `../frontend`.

## Run locally

1. Install dependencies: `npm install`
2. Keep the existing `backend/.env` and set `MONGOURI` to the MongoDB connection string.
3. Set `CORS_ORIGIN` to the frontend origin(s), comma-separated. Expo development commonly uses `http://localhost:8081`.
4. Start the server with `npm run dev` (or `npm start`).
5. Check `http://localhost:3000/api/health`.

The frontend uses `https://manu.onrender.com/api` by default. For local development set `EXPO_PUBLIC_API_URL=http://localhost:3000/api` in the frontend environment.

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
