import React, { useRef, useState } from 'react';
import { ScrollView, View, Text, Alert, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Hero, Card, Btn, Chip, Field, Sheet, Section, Avatar, IconDot, Money, Empty, LoadError, useLoad, ScreenShimmer, screenStyle, body } from '../../src/components/ui';
import { getCustomer, getStatement, recordRepayment } from '../../src/api/repo';
import { fcfa, parseAmount, fmtDateTime, uid } from '../../src/utils';
import { colors, METHODS, METHOD_ICONS } from '../../src/theme';

const TYPE = {
  opening: { label: 'Opening balance', icon: 'book-outline', up: true },
  credit_sale: { label: 'Credit sale', icon: 'arrow-up', up: true },
  payment: { label: 'Repayment', icon: 'arrow-down', up: false },
  reversal: { label: 'Reversal', icon: 'return-down-back', up: false },
};

export default function CustomerDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const [d, reload, loading, error] = useLoad(async () => ({ customer: await getCustomer(id), rows: await getStatement(id) }), { deps: [id] });
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('Cash');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const keyRef = useRef(uid());

  if (loading && !d) return <ScreenShimmer variant="detail" />;
  if (!d && error) return <LoadError error={error} onRetry={reload} />;
  if (!d?.customer) return <View style={screenStyle} />;
  const { customer: c, rows } = d;
  const used = c.credit_limit > 0 ? Math.min(1, Math.max(0, c.balance) / c.credit_limit) : 0;

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
    <ScrollView style={screenStyle} showsVerticalScrollIndicator={false}>
      <Hero eyebrow={[c.phone, c.code].filter(Boolean).join(' · ') || 'Customer account'} title={c.name} onBack={() => router.back()}>
        <Text style={s.heroLabel}>Outstanding balance</Text>
        <Money value={c.balance} size={38} color={c.balance > 0 ? '#fff' : '#9FE0BC'} style={{ marginTop: 2 }} />
        {c.credit_limit > 0 ? (
          <View style={{ marginTop: 14 }}>
            <View style={s.track}><View style={[s.fill, { width: `${used * 100}%`, backgroundColor: used >= 1 ? '#FF8A75' : colors.gold }]} /></View>
            <Text style={s.limit}>{Math.round(used * 100)}% of {fcfa(c.credit_limit)} limit used</Text>
          </View>
        ) : null}
      </Hero>

      <View style={body}>
        <Btn variant="gold" icon="cash" title="Record repayment" onPress={() => setOpen(true)} disabled={c.balance <= 0} />
        {c.notes ? (
          <Card style={{ marginTop: 14, flexDirection: 'row' }}>
            <IconDot name="document-text-outline" size={34} />
            <Text style={{ flex: 1, marginLeft: 12, color: colors.muted, lineHeight: 20 }}>{c.notes}</Text>
          </Card>
        ) : null}

        <Section title="Statement">
          <Card style={{ paddingVertical: 4 }}>
            {rows.length === 0 && <Empty icon="receipt-outline" title="No transactions yet" />}
            {rows.map((r, i) => {
              const t = TYPE[r.type] || TYPE.reversal;
              const debtUp = r.amount > 0;
              return (
                <View key={r.id} style={[s.item, i === rows.length - 1 && { borderBottomWidth: 0 }]}>
                  <IconDot name={t.icon} size={38} color={debtUp ? colors.danger : colors.ok} bg={debtUp ? colors.dangerTint : colors.okTint} />
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={s.itemTitle}>{t.label}</Text>
                    <Text style={s.itemSub} numberOfLines={2}>{fmtDateTime(r.created_at)}{r.note ? ` · ${r.note}` : ''}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[s.itemAmt, { color: debtUp ? colors.danger : colors.ok }]}>{debtUp ? '+' : '−'}{fcfa(Math.abs(r.amount))}</Text>
                    <Text style={s.itemSub}>Bal. {fcfa(r.balance)}</Text>
                  </View>
                </View>
              );
            })}
          </Card>
        </Section>
      </View>

      <Sheet visible={open} title="Record repayment" onClose={() => setOpen(false)}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          <Avatar name={c.name} />
          <View style={{ marginLeft: 12, flex: 1 }}>
            <Text style={{ fontWeight: '700', color: colors.ink }}>{c.name}</Text>
            <Text style={{ color: colors.muted, fontSize: 12 }}>Owes {fcfa(c.balance)}</Text>
          </View>
        </Card>
        <Field label="Amount (FCFA)" keyboardType="number-pad" value={amount} onChangeText={setAmount} inputStyle={{ fontSize: 22, fontWeight: '800', minHeight: 58 }} />
        <Btn small variant="soft" title="Pay full balance" onPress={() => setAmount(String(c.balance))} style={{ marginBottom: 16, alignSelf: 'flex-start' }} />
        <Text style={s.label}>Method</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, marginBottom: 14 }}>
          {METHODS.map((m) => <Chip key={m} icon={METHOD_ICONS[m]} label={m} active={method === m} onPress={() => setMethod(m)} />)}
        </View>
        {method !== 'Cash' && <Field label="Reference (transaction ID)" value={ref} onChangeText={setRef} />}
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>A repayment lowers the debt. It is not counted as a new sale.</Text>
        <Btn icon="checkmark-circle" title={busy ? 'Saving…' : 'Confirm repayment'} onPress={save} disabled={busy || parseAmount(amount) <= 0} />
      </Sheet>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 22 },
  track: { height: 7, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.18)', overflow: 'hidden' },
  fill: { height: 7, borderRadius: 4 },
  limit: { color: 'rgba(255,255,255,0.75)', fontSize: 12, marginTop: 6 },
  item: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  itemTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  itemSub: { fontSize: 12, color: colors.muted, marginTop: 2 },
  itemAmt: { fontSize: 15, fontWeight: '800' },
  label: { fontSize: 13, color: colors.muted, marginBottom: 8, fontWeight: '600' },
});