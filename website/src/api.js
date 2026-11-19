export async function cancelSale(saleId, reason) {
  if (!saleId) throw new Error('Sale ID is required');
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  return post(`/sales/${encodeURIComponent(saleId)}/cancel`, { reason: reason.trim() });
}

export async function updateSalePayment(saleId, { paidAmount, method, idempotencyKey }) {
  if (!saleId) throw new Error('Sale ID is required');
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0) throw new Error('Paid amount must be a non-negative whole number');
  if (!idempotencyKey) throw new Error('Idempotency key is required');
  const payload = await put(`/sales/${encodeURIComponent(saleId)}/payment`, { paidAmount, method, idempotencyKey });
  return normalizeSale(entity(payload, 'sale'));
}
