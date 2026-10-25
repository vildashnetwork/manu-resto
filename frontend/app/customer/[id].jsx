import React, { useRef, useState } from 'react';
import { ScrollView, View, Text, Alert } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { Card, Btn, Chip, Field, Sheet, Row, Section, Stat, useLoad, screenStyle, pad } from '../../src/components/ui';
import { getCustomer, getStatement, recordRepayment } from '../../src/api/repo';
import { fcfa, parseAmount, fmtDateTime, uid } from '../../src/utils';
import { colors, METHODS } from '../../src/theme';

const LABEL = { opening: 'Opening balance', credit_sale: 'Credit sale', payment: 'Repayment', reversal: 'Reversal' };

export default function CustomerDetail() {
  const { id } = useLocalSearchParams();
  const [d, reload] = useLoad(async () => ({ customer: await getCustomer(id), rows: await getStatement(id) }), [id]);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(uid());

  if (!d?.customer) return <View style={screenStyle} />;
  const { customer: c, rows } = d;

  async function save() {
    if (busy) return;
    setBusy(true);
    try {
      await recordRepayment({
        idempotencyKey: keyRef.current, customerId: id, amount: parseAmount(amount), method, reference: ref,
      });
      keyRef.current = uid();
      setAmount(''); setRef(''); setOpen(false);
      reload();
    } catch (e) {
      Alert.alert('Cannot record repayment', e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={screenStyle} contentContainerStyle={pad}>
      <Card>
        <Text style={{ fontSize: 20, fontWeight: '800', color: colors.ink }}>{c.name}</Text>
        <Text style={{ color: colors.muted, marginTop: 2 }}>{[c.phone, c.code].filter(Boolean).join(' · ') || 'No contact details'}</Text>
        {c.notes ? <Text style={{ color: colors.muted, marginTop: 6 }}>{c.notes}</Text> : null}
      </Card>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
        <Stat label="Outstanding" value={fcfa(c.balance)} tone={c.balance > 0 ? colors.danger : colors.ok} />
        <Stat label="Credit limit" value={c.credit_limit > 0 ? fcfa(c.credit_limit) : 'None'} />
      </View>

      <Btn title="Record repayment" onPress={() => setOpen(true)} disabled={c.balance <= 0} style={{ marginTop: 14 }} />

      <Section title="Statement">
        <Card>
          {rows.map((r) => (
            <Row
              key={r.id}
              left={LABEL[r.type] || r.type}
              sub={`${fmtDateTime(r.created_at)}${r.note ? ' · ' + r.note : ''}`}
              right={`${r.amount > 0 ? '+' : '−'}${fcfa(Math.abs(r.amount))}`}
              rightColor={r.amount > 0 ? colors.danger : colors.ok}
              subRight={`Balance ${fcfa(r.balance)}`}
            />
          ))}
          {rows.length === 0 && <Text style={{ color: colors.muted }}>No transactions yet.</Text>}
        </Card>
      </Section>

      <Sheet visible={open} title="Record repayment" onClose={() => setOpen(false)}>
        <Text style={{ color: colors.muted, marginBottom: 10 }}>Outstanding: {fcfa(c.balance)}. A repayment reduces the debt and is not counted as a new sale.</Text>
        <Field label="Amount (FCFA)" keyboardType="number-pad" value={amount} onChangeText={setAmount} />
        <Btn variant="ghost" title="Pay full balance" onPress={() => setAmount(String(c.balance))} style={{ marginBottom: 12, minHeight: 40 }} />
        <Text style={{ fontSize: 13, color: colors.muted, marginBottom: 6 }}>Method</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, rowGap: 8 }}>
          {METHODS.map((m) => <Chip key={m} label={m} active={method === m} onPress={() => setMethod(m)} />)}
        </View>
        {method !== 'Cash' && <Field label="Reference (transaction ID)" value={ref} onChangeText={setRef} />}
        <Btn title={busy ? 'Saving…' : 'Confirm repayment'} onPress={save} disabled={busy || parseAmount(amount) <= 0} />
      </Sheet>
    </ScrollView>
  );
}
