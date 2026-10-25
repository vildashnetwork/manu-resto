import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Image, Platform, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as LocalAuthentication from 'expo-local-authentication';
import { Btn } from '../src/components/ui';
import {
  AppDrawer, ConnectionModeContext, ConnectionModeToggle, DrawerContext, HeaderBrandTitle, MenuButton,
} from '../src/components/AppNavigation';
import { bootstrapLocalData, getConnectionMode, setConnectionMode } from '../src/api/repo';
import { colors } from '../src/theme';

class ScreenErrorBoundary extends React.Component {
  state = { error: null, resetKey: 0 };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[screen-render] Screen crashed', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: colors.cream, justifyContent: 'center', padding: 24 }}>
          <Text style={{ color: colors.danger, fontSize: 20, fontWeight: '800', marginBottom: 10 }}>This screen could not open</Text>
          <Text style={{ color: colors.ink, lineHeight: 21, marginBottom: 18 }}>{this.state.error.message || String(this.state.error)}</Text>
          <Btn
            title="Reload screen"
            onPress={() => this.setState((state) => ({ error: null, resetKey: state.resetKey + 1 }))}
          />
        </View>
      );
    }
    return <React.Fragment key={this.state.resetKey}>{this.props.children}</React.Fragment>;
  }
}

export default function RootLayout() {
  const [locked, setLocked] = useState(Platform.OS !== 'web');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [lockMessage, setLockMessage] = useState('');
  const [connectionMode, setMode] = useState('online');
  const [modeReady, setModeReady] = useState(false);
  const modeChangeVersion = useRef(0);
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
    let mounted = true;
    const initialVersion = modeChangeVersion.current;
    getConnectionMode().then((mode) => {
      if (mounted && modeChangeVersion.current === initialVersion) setMode(mode);
    }).catch((error) => {
      console.warn('Could not load connection mode', error);
    }).finally(() => {
      if (mounted) setModeReady(true);
    });
    return () => { mounted = false; };
  }, []);

  const changeConnectionMode = useCallback(async (mode) => {
    modeChangeVersion.current += 1;
    setMode(mode);
    const savedMode = await setConnectionMode(mode);
    return savedMode;
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      bootstrapLocalData().catch((error) => console.warn('Background data bootstrap failed', error));
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <>
      <StatusBar style="light" />
      <ConnectionModeContext.Provider value={{ mode: connectionMode, ready: modeReady, changeMode: changeConnectionMode }}>
        <DrawerContext.Provider value={() => setDrawerOpen(true)}>
          <ScreenErrorBoundary>
          <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.forest },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '700' },
            headerRight: () => <ConnectionModeToggle compact />,
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
          </ScreenErrorBoundary>
        <AppDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
        </DrawerContext.Provider>
      </ConnectionModeContext.Provider>
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
