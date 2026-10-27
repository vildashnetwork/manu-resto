import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Camera, useCameraDevice, useFrameOutput } from 'react-native-vision-camera';
import { useBarcodeScanner } from 'react-native-nitro-zxing';
import { scheduleOnRN } from 'react-native-worklets';

const BARCODE_FORMATS = [
  'aztec',
  'ean-13',
  'ean-8',
  'qr-code',
  'pdf-417',
  'upc-e',
  'data-matrix',
  'code-39',
  'code-93',
  'itf',
  'codabar',
  'code-128',
  'upc-a',
];

export default function NativeBarcodeScanner({ active, onBarcodeScanned, onError }) {
  const device = useCameraDevice('back');
  const scanner = useBarcodeScanner({ barcodeFormats: BARCODE_FORMATS });
  const hasScanned = useRef(false);
  const onBarcodeScannedRef = useRef(onBarcodeScanned);
  onBarcodeScannedRef.current = onBarcodeScanned;

  useEffect(() => {
    if (active) hasScanned.current = false;
  }, [active]);

  const handleScannedCode = useCallback((code) => {
    if (hasScanned.current || !code) return;
    hasScanned.current = true;
    onBarcodeScannedRef.current(code);
  }, []);

  const frameOutput = useFrameOutput({
    pixelFormat: 'yuv',
    onFrame(frame) {
      'worklet';
      try {
        const code = scanner.scanCodes(frame)[0]?.rawValue;
        if (code) scheduleOnRN(handleScannedCode, code);
      } finally {
        frame.dispose();
      }
    },
  });

  if (!device) {
    return (
      <View style={styles.unavailable}>
        <Text style={styles.unavailableText}>No back camera is available on this device.</Text>
      </View>
    );
  }

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device={device}
      isActive={active}
      outputs={[frameOutput]}
      onError={onError}
    />
  );
}

const styles = StyleSheet.create({
  unavailable: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#000',
  },
  unavailableText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
