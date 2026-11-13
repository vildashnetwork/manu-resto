import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const WEEKDAYS_LONG = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const pad2 = (value) => String(value).padStart(2, '0');

export function localDateInput(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function localDateTimestamp(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  if (date.getFullYear() !== Number(year) || date.getMonth() !== Number(month) - 1 || date.getDate() !== Number(day)) return null;
  return date.getTime();
}

export function prettyDate(value) {
  const timestamp = localDateTimestamp(value);
  if (timestamp === null) return 'Pick a date';
  const date = new Date(timestamp);
  return `${WEEKDAYS_LONG[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

export default function CalendarPicker({ value, onChange }) {
  const selectedTimestamp = localDateTimestamp(value);
  const initialDate = selectedTimestamp !== null ? new Date(selectedTimestamp) : new Date();
  const [view, setView] = useState({ year: initialDate.getFullYear(), month: initialDate.getMonth() });

  const now = new Date();
  const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const nextDisabled = view.year > now.getFullYear() || (view.year === now.getFullYear() && view.month >= now.getMonth());
  const firstOffset = (new Date(view.year, view.month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells = [...Array(firstOffset).fill(null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) weeks.push(cells.slice(index, index + 7));

  function shift(delta) {
    setView((current) => {
      const date = new Date(current.year, current.month + delta, 1);
      return { year: date.getFullYear(), month: date.getMonth() };
    });
  }

  return (
    <View style={s.calendar}>
      <View style={s.header}>
        <Pressable onPress={() => shift(-1)} hitSlop={10} style={s.nav}>
          <Ionicons name="chevron-back" size={20} color={colors.ink} />
        </Pressable>
        <Text style={s.title}>{MONTHS[view.month]} {view.year}</Text>
        <Pressable onPress={() => shift(1)} disabled={nextDisabled} hitSlop={10} style={[s.nav, nextDisabled && { opacity: 0.3 }]}>
          <Ionicons name="chevron-forward" size={20} color={colors.ink} />
        </Pressable>
      </View>
      <View style={s.row}>
        {WEEKDAYS.map((weekday) => <Text key={weekday} style={s.weekday}>{weekday}</Text>)}
      </View>
      {weeks.map((week, weekIndex) => (
        <View key={weekIndex} style={s.row}>
          {week.map((day, dayIndex) => {
            if (day === null) return <View key={dayIndex} style={s.cell} />;
            const timestamp = new Date(view.year, view.month, day).getTime();
            const disabled = timestamp > todayTimestamp;
            const selected = timestamp === selectedTimestamp;
            const today = timestamp === todayTimestamp;
            return (
              <View key={dayIndex} style={s.cell}>
                <Pressable
                  disabled={disabled}
                  onPress={() => onChange(`${view.year}-${pad2(view.month + 1)}-${pad2(day)}`)}
                  style={({ pressed }) => [
                    s.day,
                    today && !selected && s.today,
                    selected && s.selected,
                    pressed && !selected && { backgroundColor: colors.goldTint },
                  ]}
                >
                  <Text style={[s.dayText, disabled && s.disabled, selected && s.selectedText]}>{day}</Text>
                </Pressable>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  calendar: {
    marginTop: 10, backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: colors.line,
    paddingHorizontal: 8, paddingVertical: 10,
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 8 },
  nav: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#F4F1E8', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.ink },
  row: { flexDirection: 'row' },
  weekday: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '700', color: colors.muted, paddingVertical: 6 },
  cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', padding: 2 },
  day: { width: '100%', height: '100%', borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1.5, borderColor: colors.gold },
  selected: { backgroundColor: colors.gold },
  dayText: { fontSize: 15, fontWeight: '700', color: colors.ink },
  disabled: { color: colors.muted, opacity: 0.35 },
  selectedText: { color: colors.forestDark, fontWeight: '900' },
});
