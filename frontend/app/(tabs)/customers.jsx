import React, { useState } from 'react';
import { ScrollView, View, Text, Alert, StyleSheet, Keyboard, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Hero, Card, Btn, Chip, Field, SearchBox, Avatar, Money, Empty, Fab, useLoad, ScreenShimmer, screenStyle, body } from '../../src/components/ui';
import KeyboardSheet from '../../src/components/KeyboardSheet';
import { getCustomers, createCustomer, updateCustomer, deleteCustomer } from '../../src/api/repo';
import { fcfa, parseAmount } from '../../src/utils';
import { colors } from '../../src/theme';

const EMPTY = { name: '', phone: '', code: '', limit: '', opening: '', notes: '' };

export default function Customers() {
  const router = useRouter();
  const [list, reload, loading] = useLoad(getCustomers);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('All');
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY);
  const [editBusy, setEditBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delId, setDelId] = useState(null);
  const [delBusy, setDelBusy] = useState(false);

  async function doDelete() {
    setDelBusy(true);
    try {
      await deleteCustomer(delId);
      setDelOpen(false);
      setDelId(null);
      reload();
    } catch (e) {
      Alert.alert('Cannot delete customer', e.message);
    } finally {
      setDelBusy(false);
    }
  }

  const all = list ?? [];
  const customers = all
    .filter((c) => (c.name + (c.phone || '') + (c.code || '')).toLowerCase().includes(q.trim().toLowerCase()))
    .filter((c) => filter === 'All' || c.balance > 0)
    .sort((a, b) => (filter === 'Owing' ? b.balance - a.balance : a.name.localeCompare(b.name)));
  const totalDebt = all.reduce((sum, c) => sum + Math.max(0, c.balance), 0);
  const debtors = all.filter((c) => c.balance > 0).length;

  async function save() {
    if (saving) return;
    Keyboard.dismiss();
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

  function openEdit(customer) {
    setEditing(customer);
    setEditForm({
      name: customer.name || '',
      phone: customer.phone || '',
      code: customer.code || '',
      limit: String(customer.credit_limit || 0),
      opening: String(customer.balance || 0),
      notes: customer.notes || '',
    });
  }

  async function saveEdit() {
    if (editBusy) return;
    if (!editForm.name.trim()) {
      Alert.alert('Name required', 'Enter a name for this customer.');
      return;
    }
    Keyboard.dismiss();
    setEditBusy(true);
    try {
      await updateCustomer({
        id: editing.id,
        name: editForm.name,
        phone: editForm.phone,
        code: editForm.code,
        creditLimit: parseAmount(editForm.limit),
        openingDebt: parseAmount(editForm.opening),
        notes: editForm.notes,
      });
      setEditing(null);
      reload();
    } catch (e) {
      Alert.alert('Cannot update customer', e.message);
    } finally {
      setEditBusy(false);
    }
  }

  if (loading && !list) return <ScreenShimmer variant="list" />;

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

          {customers.length === 0 ? (
            <Card>
              <Empty icon="people-outline" title="No customers found" hint="Tap the + button to add a regular customer." />
            </Card>
          ) : (
            customers.map((c) => {
              const owing = c.balance > 0;
              const used = c.credit_limit > 0 ? Math.min(1, Math.max(0, c.balance) / c.credit_limit) : 0;
              const barColor = used >= 1 ? colors.danger : used > 0.75 ? colors.warn : colors.ok;
              return (
                <Card key={c.id} style={s.card}>
                  <Pressable
                    onPress={() => router.push(`/customer/${c.id}`)}
                    style={({ pressed }) => [s.cardMain, pressed && { opacity: 0.7 }]}
                  >
                    <View style={s.topRow}>
                      <Avatar name={c.name} />
                      <View style={s.nameWrap}>
                        <Text style={s.name} numberOfLines={2}>{c.name}</Text>
                        <Text style={s.sub} numberOfLines={1}>
                          {[c.phone, c.code].filter(Boolean).join(' · ') || 'No contact details'}
                        </Text>
                      </View>
                      <View style={s.balanceWrap}>
                        <Text style={[s.balance, { color: owing ? colors.danger : colors.ok }]} numberOfLines={1}>
                          {owing ? fcfa(c.balance) : 'Settled'}
                        </Text>
                        {owing && <Text style={s.balanceLabel}>owed</Text>}
                      </View>
                    </View>

                    {c.credit_limit > 0 && (
                      <View style={s.limitWrap}>
                        <View style={s.limitTrack}>
                          <View style={[s.limitFill, { width: `${used * 100}%`, backgroundColor: barColor }]} />
                        </View>
                        <Text style={s.limitText}>limit {fcfa(c.credit_limit)}</Text>
                      </View>
                    )}
                  </Pressable>

                  <View style={s.actions}>
                    <Pressable onPress={() => openEdit(c)} style={[s.actionBtn, s.editBtn]} hitSlop={6}>
                      <Ionicons name="pencil-outline" size={15} color={colors.ink} />
                      <Text style={[s.actionText, { color: colors.ink }]}>Edit</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => { setDelId(c.id); setDelOpen(true); }}
                      style={[s.actionBtn, s.delBtn]}
                      hitSlop={6}
                    >
                      <Ionicons name="trash-outline" size={15} color={colors.danger} />
                      <Text style={[s.actionText, { color: colors.danger }]}>Delete</Text>
                    </Pressable>
                  </View>
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>

      <Fab label="Customer" onPress={() => setOpen(true)} />

      <KeyboardSheet visible={open} title="New customer" onClose={() => setOpen(false)}>
        <Field label="Name *" value={f.name} onChangeText={(v) => setF({ ...f, name: v })} />
        <Field label="Phone" keyboardType="phone-pad" value={f.phone} onChangeText={(v) => setF({ ...f, phone: v })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Code (optional)" value={f.code} onChangeText={(v) => setF({ ...f, code: v })} />
          <Field style={{ flex: 1 }} label="Credit limit" placeholder="0 = none" keyboardType="number-pad" value={f.limit} onChangeText={(v) => setF({ ...f, limit: v })} />
        </View>
        <Field label="Opening debt from paper book (FCFA)" keyboardType="number-pad" value={f.opening} onChangeText={(v) => setF({ ...f, opening: v })} />
        <Field label="Notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })} />
        <Btn icon="checkmark" title={saving ? 'Saving…' : 'Save customer'} onPress={save} disabled={saving} />
      </KeyboardSheet>

      <KeyboardSheet visible={Boolean(editing)} title="Edit customer" onClose={() => setEditing(null)} tall>
        <Field label="Name *" value={editForm.name} onChangeText={(name) => setEditForm({ ...editForm, name })} />
        <Field label="Phone" keyboardType="phone-pad" value={editForm.phone} onChangeText={(phone) => setEditForm({ ...editForm, phone })} />
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1 }} label="Code (optional)" value={editForm.code} onChangeText={(code) => setEditForm({ ...editForm, code })} />
          <Field style={{ flex: 1 }} label="Credit limit (FCFA)" keyboardType="number-pad" value={editForm.limit} onChangeText={(limit) => setEditForm({ ...editForm, limit })} />
        </View>
        <Field label="Debt / amount owed (FCFA)" keyboardType="number-pad" value={editForm.opening} onChangeText={(opening) => setEditForm({ ...editForm, opening })} />
        <Field label="Notes" value={editForm.notes} onChangeText={(notes) => setEditForm({ ...editForm, notes })} />
        <Btn icon="checkmark-circle" title={editBusy ? 'Saving…' : 'Save changes'} onPress={saveEdit} disabled={editBusy} />
      </KeyboardSheet>

      <Modal visible={delOpen} transparent animationType="fade" onRequestClose={() => setDelOpen(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ padding: 22, borderRadius: 20, width: '86%', alignItems: 'center', backgroundColor: '#fff' }}>
            <Text style={{ fontSize: 18, fontWeight: '800', color: colors.ink, marginBottom: 8 }}>Delete customer?</Text>
            <Text style={{ color: colors.muted, textAlign: 'center', marginBottom: 16 }}>
              This will remove {all.find((customer) => customer.id === delId)?.name || 'this customer'} from your list. Their transaction history will remain in reports.
            </Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Btn variant="dangerSoft" title="Cancel" onPress={() => setDelOpen(false)} small />
              <Btn variant="danger" icon="trash" title={delBusy ? 'Deleting…' : 'Delete'} onPress={doDelete} disabled={delBusy} />
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  heroLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600', marginTop: 20 },
  heroSub: { color: 'rgba(255,255,255,0.75)', fontSize: 13, marginTop: 6 },

  card: { marginBottom: 12, padding: 0, overflow: 'hidden' },
  cardMain: { paddingHorizontal: 14, paddingTop: 14, paddingBottom: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center' },
  nameWrap: { flex: 1, marginLeft: 12, marginRight: 10 },
  name: { fontSize: 16, fontWeight: '700', color: colors.ink },
  sub: { fontSize: 12.5, color: colors.muted, marginTop: 2 },
  balanceWrap: { alignItems: 'flex-end', flexShrink: 0 },
  balance: { fontSize: 15, fontWeight: '800' },
  balanceLabel: { fontSize: 11, color: colors.muted, marginTop: 1 },

  limitWrap: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  limitTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#EFEBE0', overflow: 'hidden' },
  limitFill: { height: 5, borderRadius: 3 },
  limitText: { marginLeft: 10, fontSize: 11, color: colors.muted, fontWeight: '600' },

  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E8E3D6',
    backgroundColor: '#FAF8F2',
  },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10 },
  editBtn: { backgroundColor: '#EFEBE0' },
  delBtn: { backgroundColor: 'rgba(220,38,38,0.1)' },
  actionText: { fontSize: 13, fontWeight: '700' },
});