import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, Pressable, Modal, ScrollView, StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { colors, radius } from '../theme';

// Loads data whenever the screen gains focus; returns [data, reload].
export function useLoad(loader, deps = []) {
  const [data, setData] = useState(null);
  const run = useCallback(async () => {
    try {
      setData(await loader());
    } catch (e) {
      console.warn('load failed', e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useFocusEffect(
    useCallback(() => {
      run();
    }, [run])
  );
  return [data, run];
}

export function Card({ children, style }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function Btn({ title, onPress, variant = 'primary', disabled, style }) {
  const bg = variant === 'primary' ? colors.forest : variant === 'danger' ? colors.danger : 'transparent';
  const fg = variant === 'ghost' ? colors.forest : '#fff';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        s.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: colors.forest },
        style,
      ]}
    >
      <Text style={[s.btnText, { color: fg }]}>{title}</Text>
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

export function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: '#fff' }]}>{label}</Text>
    </Pressable>
  );
}

export function Stat({ label, value, tone, style }) {
  return (
    <View style={[s.stat, style]}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={[s.statValue, tone && { color: tone }]} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function Sheet({ visible, title, onClose, children }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
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

export function Row({ left, right, sub, subRight, rightColor, onPress }) {
  const Body = (
    <View style={s.row}>
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

export const Section = ({ title, children }) => (
  <View style={{ marginTop: 18 }}>
    <Text style={s.section}>{title}</Text>
    {children}
  </View>
);

export const screenStyle = { flex: 1, backgroundColor: colors.cream };
export const pad = { padding: 16, paddingBottom: 32 };

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.surface, borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.line,
  },
  btn: { minHeight: 48, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnText: { fontSize: 16, fontWeight: '600' },
  label: { fontSize: 13, color: colors.muted, marginBottom: 4, fontWeight: '500' },
  input: {
    minHeight: 46, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md,
    paddingHorizontal: 12, fontSize: 16, color: colors.ink, backgroundColor: '#fff',
  },
  chip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1,
    borderColor: colors.line, backgroundColor: '#fff', marginRight: 8,
  },
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
});
