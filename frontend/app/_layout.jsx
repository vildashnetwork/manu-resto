import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import { Btn } from '../src/components/ui';
import { AppDrawer, DrawerContext, HeaderBrandTitle, MenuButton } from '../src/components/AppNavigation';
import { getConnectionMode, syncNow } from '../src/api/repo';
import { colors } from '../src/theme';

export default function RootLayout() {
  const [locked, setLocked] = useState(Platform.OS !== 'web');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const authenticating = useRef(false);
  const wasBackgrounded = useRef(false);

  const unlock = useCallback(async () => {
    if (Platform.OS === 'web' || authenticating.current) return;
    authenticating.current = true;
    setLockMessage('');
    try {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !enrolled) {
        setLockMessage('Set up fingerprint or face recognition in your device settings to open the app.');
        return;
      }
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Manu’s Resto Manager',
        cancelLabel: 'Cancel',
        biometricsOnly: true,
        disableDeviceFallback: true,
      });
      if (result.success) setLocked(false);
      else setLockMessage(result.error === 'user_cancel' ? 'Authentication is required to continue.' : 'Biometric check did not succeed. Try again.');
    } catch (error) {
      setLockMessage(error.message || 'Biometric authentication is unavailable.');
    } finally {
      authenticating.current = false;
    }
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return undefined;
    unlock();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        wasBackgrounded.current = true;
        setLocked(true);
        setLockMessage('');
      } else if (state === 'active' && wasBackgrounded.current) {
        wasBackgrounded.current = false;
        unlock();
      }
    });
    return () => subscription.remove();
  }, [unlock]);

  useEffect(() => {
    getConnectionMode().then((mode) => {
      if (mode === 'online') syncNow().catch((error) => console.warn('Background sync failed', error));
    }).catch((error) => console.warn('Could not initialize local storage', error));
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <DrawerContext.Provider value={() => setDrawerOpen(true)}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.forest },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            contentStyle: { backgroundColor: colors.cream },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="customer/[id]"
            options={{
              headerTitle: () => <HeaderBrandTitle />,
              headerTitleAlign: 'left',
              headerLeft: () => <MenuButton onPress={() => setDrawerOpen(true)} />,
            }}
          />
          <Stack.Screen
            name="settings"
            options={{
              title: 'Settings',
              headerTitle: () => <HeaderBrandTitle />,
              headerTitleAlign: 'left',
              headerLeft: () => <MenuButton onPress={() => setDrawerOpen(true)} />,
            }}
          />
          <Stack.Screen
            name="sync"
            options={{
              title: 'Sync Center',
              headerTitle: () => <HeaderBrandTitle />,
              headerTitleAlign: 'left',
              headerLeft: () => <MenuButton onPress={() => setDrawerOpen(true)} />,
            }}
          />
        </Stack>
        <AppDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
      </DrawerContext.Provider>
      {locked && Platform.OS !== 'web' && (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: colors.forest, justifyContent: 'center', padding: 28 }}>
          <Image
            source={require('../public/nobglogo.png')}
            resizeMode="contain"
            accessibilityLabel="Manu's Resto logo"
            style={{ width: 220, height: 220, alignSelf: 'center', marginBottom: 18 }}
          />
          <Text style={{ color: '#fff', fontSize: 26, fontWeight: '800', textAlign: 'center', marginBottom: 10 }}>Manu’s Resto Manager</Text>
          <Text style={{ color: '#e8eee9', fontSize: 16, textAlign: 'center', marginBottom: 20 }}>Authenticate with your device biometrics to continue.</Text>
          {lockMessage ? <Text style={{ color: '#ffe3b5', textAlign: 'center', marginBottom: 16 }}>{lockMessage}</Text> : null}
          <Btn title="Unlock with biometrics" onPress={unlock} variant="ghost" style={{ backgroundColor: '#fff' }} />
        </View>
      )}
    </>
  );
}
