import 'dotenv/config';
import mongoose from 'mongoose';

const port = Number(process.env.PORT || 3000);
const mongoUri = process.env.MONGOURI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('Missing MONGOURI (or MONGODB_URI) in backend environment.');
  process.exit(1);
}

try {
  await mongoose.connect(mongoUri);
  
  // Start notification scheduler
  import('./scheduler.js').then((mod) => {
    mod.startNotificationScheduler();
  }).catch(err => {
    console.error('Failed to start notification scheduler:', err.message || err);
  });
  
  import('./app.js').then((mod) => {
    const app = mod.default;
    app.listen(port, '0.0.0.0', () => {
      console.log(`Manu's Resto API listening on port ${port}`);
    });
  }).catch(err => {
    console.error('Failed to start app:', err.message || err);
    process.exit(1);
  });
} catch (error) {
  console.error('Could not start the API or connect to MongoDB.', error);
  process.exit(1);
}
