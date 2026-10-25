import { CameraView } from 'expo-camera';

const BARCODE_TYPES = [
  'aztec', 'ean13', 'ean8', 'qr', 'pdf417', 'upc_e', 'datamatrix',
  'code39', 'code93', 'itf14', 'codabar', 'code128', 'upc_a',
];

export async function scanWithGooglePlayServices(onScanned) {
  if (!CameraView.isModernBarcodeScannerAvailable) {
    throw new Error('The Google Play Services barcode scanner is unavailable on this device.');
  }

  const subscription = CameraView.onModernBarcodeScanned(onScanned);
  try {
    await CameraView.launchScanner({ barcodeTypes: BARCODE_TYPES });
  } catch (error) {
    if (error.message !== 'Barcode scanning was cancelled') throw error;
  } finally {
    subscription.remove();
  }
}
