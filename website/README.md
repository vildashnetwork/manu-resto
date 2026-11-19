# Manu's Resto — Web app

A responsive React + Vite web companion to the Manu's Resto mobile app. The UI follows the mobile app's forest-green and warm-gold brand, with Home, Sales, Customers, Stock, and Reports sections. Layout adapts from desktop sidebar and dashboard tables to a mobile navigation drawer and compact cards.

## Run locally

```sh
cd website
npm install
npm run dev
```

To create a production build, run `npm run build`.

## Demo sign-in

Enter `123456` on the sign-in screen. This is a front-end demonstration gate only: the password is visible in the client bundle and is not secure authentication. Replace it with backend authentication before using this site with real accounts or data.

## Data and scope

The web experience currently uses sample dashboard data so the design can be explored without changing the existing frontend or backend. Connect the sections to the backend API/database before production use. Interactive navigation, search, stock filtering, demo sign-in/out, and report printing are included.
