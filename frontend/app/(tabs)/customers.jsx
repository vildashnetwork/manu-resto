import React, { useMemo, useState } from 'react';
import { ScrollView, View, Text, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Hero, Card, Btn, Chip, Field, SearchBox, Sheet, Row, Avatar, Pill, Money, Empty, Fab, LoadError, useLoad, ScreenShimmer, screenStyle, body } from '../../src/components/ui';
import { getCustomers, createCustomer } from '../../src/api/repo';
import { fcfa, parseAmount } from '../../src/utils';
import { colors } from '../../src/theme';

const EMPTY = { name: '', phone: '', code: '', limit: '', opening: '', notes: '' };

export default function Customers() {
  const router = useRouter();
  const [list, reload, loading, error] = useLoad(getCustomers);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const all = list ?? [];
  const customers = useMemo(
    () =>
      [...all]
        .filter(
          (c) =>
            (c.name + (c.phone || '') + (c.code || '')).toLowerCase().includes(q.trim().toLowerCase()),
        )
        .filter((c) => filter === 'All' || c.balance > 0)
        .sort((a, b) => (filter === 'Owing' ? b.balance - a.balance : a.name.localeCompare(b.name))),
    [all, q, filter],
  );
  const totalDebt = all.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
  const debtors = all.filter((c) => c.balance > 0).length;

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await createCustomer({
        name: f.name, phone: f.phone, code: f.code, notes: f.notes,
        creditLimit: parseAmount(f.limit), openingDebt: parseAmount(f.opening),
      });
      setF(EMPTY);
      setOpen(false);
      reload();
    } catch (e) {
      Alert.alert('Cannot save customer', e.message);
    } finally {
      setSaving(false);
    }
  }

  if (loading && !list) return <ScreenShimmer variant="list" />;
  if (!list && error) return <LoadError error={error} onRetry={reload} />;

  return (
    <View style={screenStyle}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 100 }}>
        <Hero eyebrow="Credit accounts" title="Customers">
          <Text style={s.heroLabel}>Total owed to you</Text>
          <Money value={totalDebt} size={36} color="#fff" style={{ marginTop: 2 }} />
          <Text style={s.heroSub}>{debtors} {debtors === 1 ? 'customer' : 'customers'} with an open balance · {all.length} total</Text>
        </Hero>

        <View style={body}>
          <SearchBox value={q} onChangeText={setQ} placeholder="Search name, phone or code" />
          <View style={{ flexDirection: 'row', marginTop: 12, marginBottom: 14 }}>
            {['All', 'Owing'].map((v) => <Chip key={v} label={v === 'All' ? 'All customers' : 'Owing money'} active={filter === v} onPress={() => setFilter(v)} />)}
          </View>

          <Card style={{ paddingVertical: 4 }}>
            {customers.length === 0 ? (
              <Empty icon="people-outline" title="No customers found" hint="Tap the + button to add a regular customer." />
            ) : (
              customers.map((c, i) => {
                const used = c.credit_limit > 0 ? Math.min(1, Math.max(0, c.balance) / c.credit_limit) : 0;
                return (
                  <View key={c.id}>
                    <Row
                      last={i === customers.length - 1 && c.credit_limit <= 0}
                      leading={<Avatar name={c.name} />}
                      left={c.name}
                      sub={[c.phone, c.code].filter(Boolean).join(' · ') || 'No contact details'}
                      right={c.balance > 0 ? fcfa(c.balance) : 'Settled'}
                      rightColor={c.balance > 0 ? colors.danger : colors.ok}
                      onPress={() => router.push(`/customer/${c.id}`)}
                    />
                    {c.credit_limit > 0 && (
                      <View style={s.limitWrap}>
                        <View style={s.limitTrack}>
                          <View style={[s.limitFill, { width: `${used * 100}%`, backgroundColor: used >= 1 ? colors.danger : used > 0.75 ? colors.warn : colors.ok }]} />
                        </View>
                        <Text style={s.limitText}>limit {fcfa(c.credit_limit)}</Text>
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </Card>
        </View>
      </ScrollView>

      <Fab label="Customer" onPress={() => setOpen(true)} />

      <Sheet visible={open} title="New customer" onClose={() => setOpen(false)}>
        <Field label="Name *" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Code (optional)" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} />
          <Field style={{ flex: 1 }} label="Credit limit" placeholder="0 = none" keyboardType="number-pad" value={f.limit} onChangeText={(v) => setF({ ...f, limit: v })} />
        </View>
        <Field label="Opening debt from paper book (FCFA)" keyboardType="number-pad" value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} />
        <Field label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} />
        <Btn icon="checkmark" title={saving ? 'Saving…' : 'Save customer'} onPress={save} disabled={saving} />
      </Sheet>
    </View>
  );
}

const s = StyleSheet.create({
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 20 },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6 },
  limitWrap: { flexDirection: 'row', alignItems: 'center', paddingLeft: 54, paddingBottom: 12, marginTop: -4 },
  limitTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#EFEBE0', overflow: 'hidden' },
  limitFill: { height: 5, borderRadius: 3 },
  limitText: { marginLeft: 10, fontSize: 11, color: colors.muted, fontWeight: '600' },
});