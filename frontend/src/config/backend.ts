const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const BACKEND_URL = (configuredApiUrl || 'https://manu-ltx7.onrender.com/api').replace(/\/+$/, '');
