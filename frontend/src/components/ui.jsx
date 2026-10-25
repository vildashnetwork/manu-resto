import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Modal, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, Alert, Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useContext } from 'react';
import { RefreshContext } from './AppNavigation';
import { colors, radius } from '../theme';
import { fcfa } from '../utils';

// Loads data whenever the screen gains focus; returns [data, reload].
export function useLoad(loader, deps = []) {
  const { registerRefresh, unregisterRefresh } = useContext(RefreshContext);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const run = useCallback(async () => {
    setLoading(true);
    try {
      setData(await loader());
    } catch (e) {
      console.warn('load failed', e);
      Alert.alert('Could not load data', e.message || String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useFocusEffect(
    useCallback(() => {
      registerRefresh(run);
      run();
      return () => unregisterRefresh(run);
    }, [run, registerRefresh, unregisterRefresh])
  );
  return [data, run, loading];
}

export function ShimmerBlock({ width = '100%', height = 16, radius: cornerRadius = 8, style }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.9, duration: 700, useNativeDriver: false }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      accessibilityLabel="Loading"
      style={[{ width, height, borderRadius: cornerRadius, backgroundColor: colors.line, opacity }, style]}
    />
  );
}

export function ScreenShimmer({ variant = 'list' }) {
  const rows = variant === 'sales' ? 6 : variant === 'detail' ? 4 : 5;
  return (
    <ScrollView style={screenStyle} contentContainerStyle={{ paddingBottom: 32 }} showsVerticalScrollIndicator={false}>
      <View style={s.shimmerHero}>
        <ShimmerBlock width={120} height={11} style={{ marginBottom: 12 }} />
        <ShimmerBlock width="62%" height={30} style={{ marginBottom: 20 }} />
        {variant === 'dashboard' || variant === 'reports' ? (
          <>
            <ShimmerBlock width="48%" height={12} style={{ marginBottom: 10 }} />
            <ShimmerBlock width="70%" height={36} style={{ marginBottom: 18 }} />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[0, 1, 2].map((key) => <ShimmerBlock key={key} width="31%" height={54} />)}
            </View>
          </>
        ) : variant === 'sales' ? (
          <ShimmerBlock height={46} />
        ) : null}
      </View>

      <View style={s.shimmerContent}>
        {variant === 'sales' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              {[0, 1, 2, 3].map((key) => <ShimmerBlock key={key} width={74} height={34} radius={18} />)}
            </View>
            <View style={s.shimmerGrid}>
              {Array.from({ length: rows }, (_, key) => (
                <View key={key} style={s.shimmerProduct}>
                  <ShimmerBlock height={90} radius={10} style={{ marginBottom: 10 }} />
                  <ShimmerBlock width="76%" height={14} style={{ marginBottom: 8 }} />
                  <ShimmerBlock width="48%" height={12} />
                </View>
              ))}
            </View>
          </>
        ) : variant === 'dashboard' || variant === 'reports' ? (
          <>
            {[0, 1, 2].map((key) => (
              <View key={key} style={s.shimmerCard}>
                <ShimmerBlock width="45%" height={14} style={{ marginBottom: 16 }} />
                <ShimmerBlock height={12} style={{ marginBottom: 10 }} />
                <ShimmerBlock width="82%" height={12} />
              </View>
            ))}
          </>
        ) : (
          <>
            {variant === 'list' && (
              <>
                <ShimmerBlock height={46} style={{ marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                  {[0, 1, 2].map((key) => <ShimmerBlock key={key} width={82} height={34} radius={18} />)}
                </View>
              </>
            )}
            {[0, 1, 2, 3, 4].slice(0, rows).map((key) => (
              <View key={key} style={s.shimmerRow}>
                <ShimmerBlock width={44} height={44} radius={22} />
                <View style={{ flex: 1, gap: 8 }}>
                  <ShimmerBlock width="62%" height={14} />
                  <ShimmerBlock width="82%" height={11} />
                </View>
                <ShimmerBlock width={62} height={14} />
              </View>
            ))}
          </>
        )}
      </View>
    </ScrollView>
  );
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Btn({ title, onPress, variant = 'primary', disabled, style, icon, small }) {
  const bg = variant === 'primary' ? colors.forest
    : variant === 'danger' ? colors.danger
      : variant === 'dangerSoft' ? colors.dangerTint
        : variant === 'soft' ? colors.cream
          : variant === 'gold' ? colors.gold : 'transparent';
  const fg = variant === 'ghost' || variant === 'soft' ? colors.forest
    : variant === 'dangerSoft' ? colors.danger : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        small && s.btnSmall,
        icon && { flexDirection: 'row', gap: 8 },
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.forest },
        variant === 'dangerSoft' && { borderWidth: 1, borderColor: colors.dangerTint },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={small ? 16 : 18} color={fg} /> : null}
      <Text style={[s.btnText, small && s.btnTextSmall, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Field({ label, style, ...props }) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor="#A5A99F" style={s.input} {...props} />
    </View>
  );
}

export function Chip({ label, active, onPress, icon }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive, icon && s.chipWithIcon]}>
      {icon ? <Ionicons name={icon} size={15} color={active ? '#fff' : colors.muted} /> : null}
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, tone, style, icon }) {
  return (
    <View style={[s.stat, style]}>
      {icon ? <Ionicons name={icon} size={20} color={tone || colors.forest} style={{ marginBottom: 6 }} /> : null}
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone && { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {typeof value === 'number' ? fcfa(value) : value}
      </Text>
    </View>
  );
}

export function Sheet({ visible, title, onClose, children, tall }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={[s.sheet, tall && s.sheetTall]}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ color: colors.muted, fontSize: 16 }}>Close</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            {children}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Row({ left, right, sub, subRight, rightColor, onPress, leading, last }) {
  const Body = (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      {leading ? <View style={{ marginRight: 10 }}>{leading}</View> : null}
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={s.rowLeft}>{left}</Text>
        {sub ? <Text style={s.rowSub}>{sub}</Text> : null}
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[s.rowRight, rightColor && { color: rightColor }]}>{right}</Text>
        {subRight ? <Text style={s.rowSub}>{subRight}</Text> : null}
      </View>
    </View>
  );
  return onPress ? <Pressable onPress={onPress}>{Body}</Pressable> : Body;
}

export const Section = ({ title, children, action, onAction }) => (
  <View style={{ marginTop: 18 }}>
    <View style={s.sectionHead}>
      <Text style={s.section}>{title}</Text>
      {action ? <Pressable onPress={onAction}><Text style={s.sectionAction}>{action}</Text></Pressable> : null}
    </View>
    {children}
  </View>
);

export const screenStyle = { flex: 1, backgroundColor: colors.cream };
export const pad = { padding: 16, paddingBottom: 32 };
export const body = { padding: 16, paddingBottom: 32 };

export function Hero({ eyebrow, title, children }) {
  return (
    <View style={s.hero}>
      <Text style={s.heroEyebrow}>{eyebrow}</Text>
      <Text style={s.heroTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function Money({ value, size = 18, color = colors.ink, style }) {
  return <Text style={[{ fontSize: size, fontWeight: '800', color }, style]}>{fcfa(value)}</Text>;
}

export function IconDot({ name, size = 34, color = colors.forest, bg = colors.cream }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: bg }}>
      <Ionicons name={name} size={size * 0.52} color={color} />
    </View>
  );
}

export function Pill({ label, tone = 'neutral' }) {
  const palette = tone === 'ok'
    ? { backgroundColor: '#E4F2E8', color: colors.ok }
    : tone === 'warn'
      ? { backgroundColor: '#FFF1D8', color: colors.warn }
      : tone === 'danger'
        ? { backgroundColor: colors.dangerTint, color: colors.danger }
      : tone === 'gold'
        ? { backgroundColor: colors.goldTint, color: colors.forest }
      : { backgroundColor: colors.cream, color: colors.muted };
  return <Text style={[s.pill, { backgroundColor: palette.backgroundColor, color: palette.color }]}>{label}</Text>;
}

export function Empty({ icon = 'file-tray-outline', title, hint }) {
  return (
    <View style={s.empty}>
      <IconDot name={icon} size={42} color={colors.muted} bg={colors.cream} />
      <Text style={s.emptyTitle}>{title}</Text>
      {hint ? <Text style={s.emptyHint}>{hint}</Text> : null}
    </View>
  );
}

export function Fab({ label, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Add ${label}`}
      style={({ pressed }) => [s.fab, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Ionicons name="add" size={22} color="#fff" />
      <Text style={s.fabText}>{label}</Text>
    </Pressable>
  );
}

export function SearchBox({ value, onChangeText, placeholder, dark, style, ...props }) {
  return (
    <View style={[s.searchBox, dark && s.searchBoxDark, style]}>
      <Ionicons name="search-outline" size={19} color={dark ? '#D4DFD6' : colors.muted} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={dark ? '#C1CEC3' : colors.faint}
        style={[s.searchInput, dark && s.searchInputDark]}
        {...props}
      />
    </View>
  );
}

export function Avatar({ name = '', size = 42 }) {
  const initials = String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('') || '?';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.forestTint, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: colors.forest, fontSize: size * 0.36, fontWeight: '800' }}>{initials}</Text>
    </View>
  );
}

export function Segmented({ options, value, onChange }) {
  return (
    <View style={s.segmented}>
      {options.map((option) => {
        const active = value === option;
        return (
          <Pressable key={option} onPress={() => onChange(option)} style={[s.segment, active && s.segmentActive]}>
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{option}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  btn: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnSmall: { minHeight: 36, paddingHorizontal: 10, flexDirection: 'row', gap: 6 },
  btnText: { fontSize: 16, fontWeight: '600' },
  btnTextSmall: { fontSize: 13 },
  label: { fontSize: 13, color: colors.muted, marginBottom: 4, fontWeight: '500' },
  input: {
    minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, fontSize: 16, color: colors.ink, backgroundColor: '#fff',
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: colors.line, backgroundColor: '#fff', marginRight: 8, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  chipWithIcon: { paddingLeft: 10 },
  chipActive: { backgroundColor: colors.forest, borderColor: colors.forest },
  chipText: { color: colors.ink, fontWeight: '500' },
  stat: {
    flex: 1, minWidth: '47%', backgroundColor: colors.surface, borderRadius: radius.md,
    padding: 12, borderWidth: 1, borderColor: colors.line,
  },
  statLabel: { fontSize: 12, color: colors.muted, marginBottom: 4 },
  statValue: { fontSize: 18, fontWeight: '700', color: colors.ink },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.cream, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 16, maxHeight: '85%',
  },
  sheetTall: { maxHeight: '94%' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sheetTitle: { fontSize: 18, fontWeight: '700', color: colors.ink },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line,
  },
  rowLeft: { fontSize: 15, color: colors.ink, fontWeight: '500' },
  rowRight: { fontSize: 15, color: colors.ink, fontWeight: '600' },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  section: { fontSize: 13, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionAction: { color: colors.forest, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  hero: { backgroundColor: colors.forest, paddingHorizontal: 18, paddingTop: 22, paddingBottom: 20, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  heroEyebrow: { color: colors.gold, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 28, fontWeight: '800', marginTop: 3 },
  pill: { overflow: 'hidden', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '700' },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: 20, gap: 9 },
  emptyTitle: { color: colors.muted, fontSize: 13, textAlign: 'center' },
  emptyHint: { color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', paddingHorizontal: 20 },
  fab: { position: 'absolute', right: 18, bottom: 20, minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 18, borderRadius: 26, backgroundColor: colors.forest, elevation: 6, shadowColor: '#142A1E', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 },
  fabText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  searchBox: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line, borderRadius: radius.md },
  searchBoxDark: { backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.22)' },
  searchInput: { flex: 1, minWidth: 0, paddingVertical: 8, color: colors.ink, fontSize: 15 },
  searchInputDark: { color: '#fff' },
  segmented: { flexDirection: 'row', padding: 3, borderRadius: radius.md, backgroundColor: colors.cream },
  segment: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radius.sm },
  segmentActive: { backgroundColor: '#fff', elevation: 1 },
  segmentText: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  segmentTextActive: { color: colors.forest, fontWeight: '800' },
  shimmerHero: { backgroundColor: colors.forest, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 22, borderBottomLeftRadius: 22, borderBottomRightRadius: 22 },
  shimmerContent: { padding: 16 },
  shimmerCard: { padding: 16, marginBottom: 14, borderRadius: radius.lg, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
  shimmerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginBottom: 10, borderRadius: radius.md, backgroundColor: '#fff' },
  shimmerGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  shimmerProduct: { width: '48.5%', padding: 10, marginBottom: 10, borderRadius: radius.md, backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
});
