import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, StyleSheet,
  Keyboard, Platform, TextInput, findNodeHandle, useWindowDimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

/**
 * Keyboard-aware bottom sheet (drop-in replacement for <Sheet>).
 * - Reads the real keyboard height and lifts the sheet above it.
 * - Shrinks the sheet's max height so the form stays scrollable.
 * - Scrolls the focused input into view.
 *
 * Save as: src/components/KeyboardSheet.jsx
 */
export default function KeyboardSheet({ visible, title, onClose, tall, children }) {
  const { height: winH } = useWindowDimensions();
  const [kb, setKb] = useState(0);
  const scrollRef = useRef(null);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvt, (e) => {
      setKb(e.endCoordinates?.height || 0);
      // after layout settles, scroll the focused field into view
      setTimeout(scrollFocusedIntoView, 120);
    });
    const hide = Keyboard.addListener(hideEvt, () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  function scrollFocusedIntoView() {
    const input = TextInput.State.currentlyFocusedInput?.();
    const sv = scrollRef.current;
    if (!input || !sv) return;
    input.measureLayout(
      findNodeHandle(sv),
      (_x, y) => sv.scrollTo({ y: Math.max(0, y - 90), animated: true }),
      () => {}
    );
  }

  const topGap = 48;
  const available = winH - kb - topGap;
  const sheetMax = kb > 0 ? available : winH * (tall ? 0.92 : 0.8);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={[ks.overlay, { paddingBottom: kb }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => { Keyboard.dismiss(); onClose?.(); }} />
        <View style={[ks.sheet, { maxHeight: sheetMax }]}>
          <View style={ks.handle} />
          <View style={ks.header}>
            <Text style={ks.title} numberOfLines={1}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Close">
              <Ionicons name="close" size={24} color={colors.ink} />
            </Pressable>
          </View>
          <ScrollView
            ref={scrollRef}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'none'}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: kb > 0 ? 40 : 28 }}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const ks = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: { backgroundColor: colors.cream, borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' },
  handle: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: '#CFC7B1', marginTop: 8 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14 },
  title: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.ink, marginRight: 12 },
});
