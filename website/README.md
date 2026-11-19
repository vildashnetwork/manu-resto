# Manu's Resto website (notification branch)

Responsive React/Vite web companion, designed to follow the mobile app's forest/cream/gold palette and its Home, Sales, Customers, Stock, Reports, and Settings sections. Desktop uses a left navigation rail; mobile uses the mobile-app-style fixed bottom tab bar and a slide-out menu. The website reads and writes to the same API endpoints as the mobile app.

## Run

```sh
cd website
npm install
npm run dev
```

Set `VITE_API_URL` to override the API base URL. Defaults to `https://manu-ltx7.onrender.com/api`. The API must allow browser CORS from the website origin.

## Demo password

The requested demo password is `123456`. It is checked entirely in the browser and is not secure authentication. Do not rely on it to protect production data; use server-side authentication and authorization.

## API scope

Dashboard, sales, customers, stock movements, reports/expenses, and notification settings use the backend API. Product/customer writes and reminders are constrained to the endpoints exposed by the mobile app; mobile-only camera barcode scanning, push token registration, and native PDF sharing require browser-specific implementations and are not claimed as supported here. Data requires the API to be reachable and CORS-enabled.
