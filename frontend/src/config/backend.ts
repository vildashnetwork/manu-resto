const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;

export const BACKEND_URL = (configuredApiUrl || 'https://manu.onrender.com/api').replace(/\/+$/, '');
