import React, { useContext, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius } from '../theme';

export const DrawerContext = React.createContext(() => {});
export const ConnectionModeContext = React.createContext({
  mode: 'online',
  ready: false,
  changeMode: async () => {},
});

const LINKS = [
  { label: 'Home', path: '/', icon: 'home-outline' },
  { label: 'Sales', path: '/sales', icon: 'cart-outline' },
  { label: 'Customers', path: '/customers', icon: 'people-outline' },
  { label: 'Stock', path: '/stock', icon: 'cube-outline' },
  { label: 'Reports', path: '/reports', icon: 'bar-chart-outline' },
  { label: 'Sync Center', path: '/sync', icon: 'sync-outline' },
  { label: 'Settings', path: '/settings', icon: 'settings-outline' },
];

export function HeaderBrandTitle() {
  return (
    <View style={s.headerBrand}>
      <Image source={require('../../public/receipt-logo.png')} style={s.headerLogo} resizeMode="contain" />
      <Text style={s.headerName} numberOfLines={1}>Manu’s Resto</Text>
    </View>
  );
}

export function MenuButton({ onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Open navigation menu"
      hitSlop={10}
      style={s.menuButton}
    >
      <Ionicons name="menu" size={25} color="#fff" />
    </Pressable>
  );
}

export function ConnectionModeToggle({ compact = false }) {
  const { mode, changeMode } = useContext(ConnectionModeContext);
  const [saving, setSaving] = useState(false);
  const online = mode === 'online';

  async function toggle() {
    if (saving) return;
    setSaving(true);
    try {
      await changeMode(online ? 'offline' : 'online');
    } catch (error) {
      Alert.alert('Could not change connection mode', error.message || String(error));
    } finally {
      setSaving(false);
    }
  }

  if (compact) {
    return (
      <Pressable
        onPress={toggle}
        disabled={saving}
        accessibilityRole="switch"
        accessibilityState={{ checked: online, disabled: saving }}
        accessibilityLabel={`Connection mode ${online ? 'online' : 'offline'}`}
        style={[s.modeCompact, online ? s.modeCompactOnline : s.modeCompactOffline, saving && s.modeDisabled]}
      >
        <Ionicons name={online ? 'cloud-outline' : 'cloud-offline-outline'} size={15} color="#fff" />
        <Text style={s.modeCompactText}>{online ? 'Online' : 'Offline'}</Text>
      </Pressable>
    );
  }

  return (
    <View style={s.modePanel}>
      <View style={s.modeText}>
        <Text style={s.modeTitle}>Connection mode</Text>
        <Text style={s.modeDetail}>{online ? 'Sync with the backend' : 'Use saved device data'}</Text>
      </View>
      <Switch
        value={online}
        onValueChange={toggle}
        disabled={saving}
        trackColor={{ false: '#69776E', true: colors.gold }}
        thumbColor={online ? colors.forestDark : '#E1E9E2'}
        accessibilityLabel="Online mode"
      />
    </View>
  );
}

export function AppDrawer({ visible, onClose }) {
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const router = useRouter();

  function navigate(path) {
    onClose();
    router.replace(path);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={s.overlay}>
        <View style={[s.drawer, { paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={s.brandCard}>
            <Image source={require('../../public/receipt-logo.png')} style={s.drawerLogo} resizeMode="contain" />
            <View style={{ flex: 1 }}>
              <Text style={s.brandName}>Manu’s Resto</Text>
              <Text style={s.brandSubtitle}>MANAGER</Text>
            </View>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close navigation menu" hitSlop={10}>
              <Ionicons name="close" size={24} color="#fff" />
            </Pressable>
          </View>

          <ConnectionModeToggle />

          <Text style={s.menuCaption}>WORKSPACE</Text>
          <View style={s.links}>
            {LINKS.map((link) => {
              const active = link.path === '/'
                ? pathname === '/' || pathname === '/index'
                : pathname === link.path || pathname.startsWith(`${link.path}/`);
              return (
                <Pressable
                  key={link.path}
                  onPress={() => navigate(link.path)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [s.link, active && s.linkActive, pressed && !active && s.linkPressed]}
                >
                  <Ionicons name={link.icon} size={21} color={active ? colors.forestDark : '#E1E9E2'} />
                  <Text style={[s.linkText, active && s.linkTextActive]}>{link.label}</Text>
                  {active ? <View style={s.activeMark} /> : null}
                </Pressable>
              );
            })}
          </View>

          <View style={s.footer}>
            <Text style={s.footerTitle}>Good food · Great drinks</Text>
            <Text style={s.footerSubtitle}>Manu’s Resto Manager</Text>
          </View>
        </View>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close navigation menu" />
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.42)' },
  drawer: { width: 300, maxWidth: '84%', backgroundColor: colors.forestDark, paddingHorizontal: 18 },
  backdrop: { flex: 1 },
  brandCard: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingBottom: 22, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.16)' },
  drawerLogo: { width: 54, height: 54, borderRadius: 14, backgroundColor: '#fff' },
  brandName: { color: '#fff', fontSize: 17, fontWeight: '800' },
  brandSubtitle: { color: colors.gold, fontSize: 10, fontWeight: '800', letterSpacing: 1.6, marginTop: 3 },
  menuCaption: { color: '#AAB8AD', fontSize: 10, fontWeight: '800', letterSpacing: 1.5, marginTop: 26, marginBottom: 10 },
  links: { gap: 5 },
  link: { minHeight: 49, flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: radius.md, paddingHorizontal: 13 },
  linkActive: { backgroundColor: colors.gold },
  linkPressed: { backgroundColor: 'rgba(255,255,255,0.1)' },
  linkText: { color: '#E1E9E2', fontSize: 15, fontWeight: '600', flex: 1 },
  linkTextActive: { color: colors.forestDark, fontWeight: '800' },
  activeMark: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.forestDark },
  footer: { marginTop: 'auto', paddingTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.16)' },
  footerTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
  footerSubtitle: { color: '#AAB8AD', fontSize: 11, marginTop: 5 },
  headerBrand: { flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: 220 },
  headerLogo: { width: 34, height: 34 },
  headerName: { color: '#fff', fontSize: 16, fontWeight: '800' },
  menuButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  modeCompact: { minWidth: 82, height: 34, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, borderRadius: 17, paddingHorizontal: 10, marginRight: 10 },
  modeCompactOnline: { backgroundColor: '#2D6548' },
  modeCompactOffline: { backgroundColor: '#6B5940' },
  modeCompactText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  modeDisabled: { opacity: 0.6 },
  modePanel: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, marginTop: 15, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.09)' },
  modeText: { flex: 1 },
  modeTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
  modeDetail: { color: '#C4D0C7', fontSize: 11, marginTop: 3 },
});
