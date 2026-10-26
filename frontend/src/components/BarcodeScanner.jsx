import React, { useRef } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import {
  Camera,
  useCameraDevices,
  useFrameProcessor,
  useCameraPermission,
} from 'react-native-vision-camera';
import { CodeScanner } from '@matterlabs/react-native-vision-camera-code-scanner';
import { Ionicons } from '@expo/vector-icons';

export default function BarcodeScanner({ visible, onClose, onBarcodeScanned }) {
  const [permission, requestPermission] = useCameraPermission();
  const devices = useCameraDevices(Camera.Position.BACK);
  const device = Object.values(devices)[0];
  const scannerRef = useRef(new CodeScanner());

  const frameProcessor = useFrameProcessor(
    (frame) => {
      'worklet';
      scannerRef.current.scanForCodes(frame, (codes) => {
        if (codes.length > 0) {
          onBarcodeScanned(codes[0].data);
        }
      });
    },
    [onBarcodeScanned]
  );

  if (!visible || !device) return null;

  if (permission.status !== 'granted') {
    return (
      <View style={styles.permissionContainer}>
        <Text style={styles.permissionText}>
          Camera permission is required to scan barcodes.
        </Text>
        <Pressable onPress={requestPermission} style={styles.requestButton}>
          <Text style={styles.requestText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive
        frameProcessor={frameProcessor}
      />
      <View style={styles.overlay}>
        <Text style={styles.title}>Scan product barcode</Text>
        <Text style={styles.subtitle}>Hold the code inside the frame</Text>
        <View style={styles.frame} />
        <Pressable onPress={onClose} style={styles.closeButton}>
          <Ionicons name="close" size={20} color="#fff" />
          <Text style={styles.closeText}>Cancel scan</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 64,
    paddingBottom: 44,
  },
  title: {
    color: '#fff',
    fontSize: 21,
    fontWeight: '800',
    textAlign: 'center',
    marginHorizontal: 24,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: 14,
    textAlign: 'center',
    marginHorizontal: 24,
    marginTop: 7,
  },
  frame: {
    width: 280,
    height: 190,
    alignSelf: 'center',
  },
  closeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
  },
  closeText: {
    color: '#1E3A2B',
    fontWeight: '700',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  permissionText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 16,
  },
  requestButton: {
    backgroundColor: '#fff',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  requestText: {
    color: '#1E3A2B',
    fontWeight: '700',
  },
});