export async function cancelSale(saleId, reason) {
  if (!reason?.trim()) throw new Error('A cancellation reason is required');
  const payload = await post(`/sales/${encodeURIComponent(saleId)}/cancel`, { reason: reason.trim() });
  return entity(payload, 'sale');
}
