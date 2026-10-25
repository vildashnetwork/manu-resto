import mongoose from 'mongoose';

const { Schema } = mongoose;
const options = { versionKey: false };

const productSchema = new Schema({
  name: { type: String, required: true, trim: true },
  category: { type: String, required: true, default: 'Other' },
  unit: { type: String, required: true, default: 'unit' },
  price: { type: Number, required: true, min: 1 },
  cost: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 0, min: 0 },
  tracked: { type: Boolean, default: false },
  stock: { type: Number, default: 0, min: 0 },
  imageUrl: { type: String, required: true },
  active: { type: Boolean, default: true },
  created_at: { type: Number, default: Date.now },
}, options);

const customerSchema = new Schema({
  name: { type: String, required: true, trim: true },
  phone: { type: String, default: null },
  code: { type: String, default: null },
  creditLimit: { type: Number, default: 0, min: 0 },
  balance: { type: Number, default: 0 },
  notes: { type: String, default: null },
  active: { type: Boolean, default: true },
  created_at: { type: Number, default: Date.now },
}, options);

const stockMovementSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  type: { type: String, required: true },
  qty: { type: Number, required: true },
  note: { type: String, default: null },
  refId: { type: String, default: null },
  created_at: { type: Number, default: Date.now, index: true },
}, options);

const saleItemSchema = new Schema({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  product_name: { type: String, required: true },
  unit_price: { type: Number, required: true },
  unit_cost: { type: Number, required: true },
  qty: { type: Number, required: true },
  line_total: { type: Number, required: true },
}, { ...options, _id: false });

const saleSchema = new Schema({
  receipt_no: { type: String, required: true },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
  customer_name: { type: String, default: null },
  items: { type: [saleItemSchema], required: true },
  total: { type: Number, required: true },
  paid_amount: { type: Number, required: true },
  credit_amount: { type: Number, required: true },
  status: { type: String, enum: ['completed', 'cancelled'], default: 'completed' },
  cancel_reason: { type: String, default: null },
  idempotencyKey: { type: String, required: true, unique: true },
  created_at: { type: Number, default: Date.now, index: true },
}, options);

const paymentSchema = new Schema({
  kind: { type: String, enum: ['sale', 'repayment'], required: true },
  saleId: { type: Schema.Types.ObjectId, ref: 'Sale', default: null },
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', default: null },
  method: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  reference: { type: String, default: null },
  status: { type: String, enum: ['ok', 'reversed'], default: 'ok' },
  idempotencyKey: { type: String, required: true, unique: true },
  created_at: { type: Number, default: Date.now, index: true },
}, options);

const ledgerSchema = new Schema({
  customerId: { type: Schema.Types.ObjectId, ref: 'Customer', required: true, index: true },
  type: { type: String, enum: ['opening', 'credit_sale', 'payment', 'reversal'], required: true },
  amount: { type: Number, required: true },
  ref_type: { type: String, default: null },
  ref_id: { type: String, default: null },
  note: { type: String, default: null },
  created_at: { type: Number, default: Date.now, index: true },
}, options);

const expenseSchema = new Schema({
  category: { type: String, required: true },
  amount: { type: Number, required: true, min: 1 },
  method: { type: String, required: true },
  note: { type: String, default: null },
  created_at: { type: Number, default: Date.now, index: true },
}, options);

export const Product = mongoose.models.Product || mongoose.model('Product', productSchema);
export const Customer = mongoose.models.Customer || mongoose.model('Customer', customerSchema);
export const StockMovement = mongoose.models.StockMovement || mongoose.model('StockMovement', stockMovementSchema);
export const Sale = mongoose.models.Sale || mongoose.model('Sale', saleSchema);
export const Payment = mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
export const Ledger = mongoose.models.Ledger || mongoose.model('Ledger', ledgerSchema);
export const Expense = mongoose.models.Expense || mongoose.model('Expense', expenseSchema);
