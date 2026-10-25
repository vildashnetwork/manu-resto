import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet, Btn, Chip } from './ui';
import { colors } from '../theme';

/* ------------------------------- date helpers ------------------------------- */

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEK = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

export const dayStart = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
};
export const dayEnd = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
};
const addDays = (ms, n) => {
  const x = new Date(ms);
  x.setDate(x.getDate() + n);
  return dayStart(x);
};

// Each preset returns [fromDayStart, toDayStart].
export const PRESETS = {
  Today: () => { const t = dayStart(Date.now()); return [t, t]; },
  Yesterday: () => { const t = addDays(dayStart(Date.now()), -1); return [t, t]; },
  '7 days': () => { const t = dayStart(Date.now()); return [addDays(t, -6), t]; },
  '30 days': () => { const t = dayStart(Date.now()); return [addDays(t, -29), t]; },
  'This month': () => { const n = new Date(); return [dayStart(new Date(n.getFullYear(), n.getMonth(), 1)), dayStart(n)]; },
  'Last month': () => {
    const n = new Date();
    return [dayStart(new Date(n.getFullYear(), n.getMonth() - 1, 1)), dayStart(new Date(n.getFullYear(), n.getMonth(), 0))];
  },
  'This year': () => { const n = new Date(); return [dayStart(new Date(n.getFullYear(), 0, 1)), dayStart(n)]; },
};

export const presetFor = (from, to) =>
  Object.keys(PRESETS).find((k) => { const [a, b] = PRESETS[k](); return a === from && b === to; }) || null;

const fmt = (ms, withYear) => {
  const d = new Date(ms);
  return `${d.getDate()} ${SHORT[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ''}`;
};

export function rangeLabel(from, to) {
  const thisYear = new Date().getFullYear();
  const y = new Date(from).getFullYear() !== thisYear || new Date(to).getFullYear() !== thisYear;
  return from === to ? fmt(from, true) : `${fmt(from, y)} – ${fmt(to, true)}`;
}

const countDays = (a, b) => Math.round((b - a) / 86400000) + 1;

/* --------------------------------- calendar --------------------------------- */

function Day({ ms, start, end, today, onPress }) {
  if (!ms) return <View style={s.cell} />;
  const last = end ?? start;
  const disabled = ms > today;
  const isStart = ms === start;
  const isEnd = ms === last;
  const edge = isStart || isEnd;
  const span = start && end && start !== end;
  const inside = span && ms > start && ms < end;
  return (
    <Pressable disabled={disabled} onPress={() => onPress(ms)} style={s.cell}>
      {inside ? <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.forestTint }]} /> : null}
      {span && isStart ? <View style={[s.half, { left: '50%', right: 0 }]} /> : null}
      {span && isEnd ? <View style={[s.half, { left: 0, right: '50%' }]} /> : null}
      <View style={[s.dot, edge && s.dotActive, !edge && ms === today && s.dotToday]}>
        <Text style={[s.dayText, edge && { color: '#fff', fontWeight: '800' }, disabled && { color: '#C9C3B2' }]}>
          {new Date(ms).getDate()}
        </Text>
      </View>
    </Pressable>
  );
}

/* ----------------------------------- sheet ----------------------------------- */

export default function DateRangeSheet({ visible, from, to, onApply, onClose }) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [view, setView] = useState(new Date(from));
  const today = dayStart(Date.now());

  useEffect(() => {
    if (visible) {
      setStart(from);
      setEnd(from === to ? null : to);
      setView(new Date(from));
    }
  }, [visible, from, to]);

  const y = view.getFullYear();
  const m = view.getMonth();
  const lead = (new Date(y, m, 1).getDay() + 6) % 7; // week starts on Monday
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => dayStart(new Date(y, m, i + 1)))];
  while (cells.length % 7) cells.push(null);
  const rows = [];
  for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));

  const now = new Date();
  const canNext = y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth());
  const shift = (n) => setView(new Date(y, m + n, 1));

  function pick(ms) {
    if (!start || (start && end)) { setStart(ms); setEnd(null); }
    else if (ms < start) setStart(ms);
    else setEnd(ms);
  }

  function preset(key) {
    const [a, b] = PRESETS[key]();
    setStart(a);
    setEnd(a === b ? null : b);
    setView(new Date(b));
  }

  const last = end ?? start;
  const activeKey = start ? presetFor(start, last) : null;

  return (
    <Sheet visible={visible} title="Select dates" onClose={onClose}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        {Object.keys(PRESETS).map((k) => <Chip key={k} label={k} active={activeKey === k} onPress={() => preset(k)} />)}
      </ScrollView>

      <View style={s.card}>
        <View style={s.monthRow}>
          <Pressable onPress={() => shift(-1)} style={s.nav} hitSlop={8}><Ionicons name="chevron-back" size={20} color={colors.forest} /></Pressable>
          <Text style={s.month}>{MONTHS[m]} {y}</Text>
          <Pressable onPress={() => canNext && shift(1)} style={[s.nav, !canNext && { opacity: 0.3 }]} hitSlop={8}>
            <Ionicons name="chevron-forward" size={20} color={colors.forest} />
          </Pressable>
        </View>
        <View style={{ flexDirection: 'row', marginBottom: 4 }}>
          {WEEK.map((w) => <Text key={w} style={s.week}>{w}</Text>)}
        </View>
        {rows.map((r, i) => (
          <View key={i} style={{ flexDirection: 'row' }}>
            {r.map((ms, j) => <Day key={j} ms={ms} start={start} end={end} today={today} onPress={pick} />)}
          </View>
        ))}
      </View>

      <View style={s.summary}>
        <Ionicons name="calendar-outline" size={20} color={colors.forest} />
        <View style={{ marginLeft: 10, flex: 1 }}>
          <Text style={s.sumMain}>{start ? rangeLabel(start, last) : 'Tap a start date'}</Text>
          <Text style={s.sumSub}>
            {!start ? '' : end || start === last ? `${countDays(start, last)} ${countDays(start, last) === 1 ? 'day' : 'days'}` : 'Tap an end date, or apply for one day'}
          </Text>
        </View>
      </View>

      <Btn variant="gold" icon="checkmark-circle" title="Apply" disabled={!start} onPress={() => onApply(start, last)} />
    </Sheet>
  );
}

const s = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 18, padding: 12, marginBottom: 14 },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  month: { fontSize: 17, fontWeight: '800', color: colors.ink },
  nav: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.forestTint, alignItems: 'center', justifyContent: 'center' },
  week: { width: '14.2857%', textAlign: 'center', fontSize: 12, fontWeight: '700', color: colors.faint, paddingVertical: 4 },
  cell: { width: '14.2857%', height: 44, alignItems: 'center', justifyContent: 'center' },
  half: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.forestTint },
  dot: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  dotActive: { backgroundColor: colors.forest },
  dotToday: { borderWidth: 1.5, borderColor: colors.gold },
  dayText: { fontSize: 15, fontWeight: '600', color: colors.ink },
  summary: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.forestTint, borderRadius: 14, padding: 14, marginBottom: 14 },
  sumMain: { fontSize: 16, fontWeight: '800', color: colors.forest },
  sumSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
