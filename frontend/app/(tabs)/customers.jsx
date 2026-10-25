import React, { useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Card, Btn, Field, Sheet, Row, Stat, useLoad, screenStyle, pad } from '../../src/components/ui';
import { getCustomers, createCustomer } from '../../src/api/repo';
import { fcfa, parseAmount } from '../../src/utils';
import { colors } from '../../src/theme';

const EMPTY = { name: '', phone: '', code: '', limit: '', opening: '', notes: '' };

export default function Customers() {
  const router = useRouter();
  const [list, reload] = useLoad(getCustomers);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const customers = (list ?? []).filter((c) => (c.name + (c.phone || '') + (c.code || '')).toLowerCase().includes(q.trim().toLowerCase()));
  const totalDebt = (list ?? []).reduce((s, c) => s + Math.max(0, c.balance), 0);
  const debtors = (list ?? []).filter((c) => c.balance > 0).length;

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

  return (
    <ScrollView style={screenStyle} contentContainerStyle={pad} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Stat label="Total owed to you" value={fcfa(totalDebt)} tone={colors.danger} />
        <Stat label="Customers with debt" value={String(debtors)} />
      </View>

      <Field style={{ marginTop: 14 }} placeholder="Search name, phone or code" value={q} onChangeText={setQ} />
      <Btn title="Add customer" onPress={() => setOpen(true)} style={{ marginBottom: 12 }} />

      <Card>
        {customers.length === 0 ? (
          <Text style={{ color: colors.muted }}>No customers found.</Text>
        ) : (
          customers.map((c) => (
            <Row
              key={c.id}
              left={c.name}
              sub={[c.phone, c.code].filter(Boolean).join(' · ') || undefined}
              right={fcfa(c.balance)}
              rightColor={c.balance > 0 ? colors.danger : colors.ok}
              subRight={c.credit_limit > 0 ? `limit ${fcfa(c.credit_limit)}` : undefined}
              onPress={() => router.push(`/customer/${c.id}`)}
            />
          ))
        )}
      </Card>

      <Sheet visible={open} title="New customer" onClose={() => setOpen(false)}>
        <Field label="Name *" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
        <Field label="Code (optional)" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} />
        <Field label="Credit limit (FCFA, 0 = none)" keyboardType="number-pad" value={f.limit} onChangeText={(v) => setF({ ...f, limit: v })} />
        <Field label="Opening debt from paper book (FCFA)" keyboardType="number-pad" value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} />
        <Field label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} />
        <Btn title={saving ? 'Saving…' : 'Save customer'} onPress={save} disabled={saving} />
      </Sheet>
    </ScrollView>
  );
}
