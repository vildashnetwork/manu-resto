import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app.js';

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGOURI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('Missing MONGOURI (or MONGODB_URI) in backend environment.');
  process.exit(1);
}

try {
  await mongoose.connect(mongoUri);
  app.listen(port, '0.0.0.0', () => {
    console.log(`Manu's Resto API listening on port ${port}`);
  });
} catch (error) {
  console.error('Could not start the API or connect to MongoDB.', error);
  process.exit(1);
}
