const mongoose = require('mongoose');

const invoiceItemSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  hsn:         { type: String, default: '' },      // HSN/SAC code
  qty:         { type: Number, required: true, min: 0 },
  unit:        { type: String, default: 'Nos' },
  rate:        { type: Number, required: true, min: 0 },
  gstPct:      { type: Number, default: 5, min: 0, max: 100 }, // total GST% for this line (may vary per item/order)
  amount:      { type: Number, required: true, min: 0 },  // base value = qty * rate
  cgstAmt:     { type: Number, default: 0 },
  sgstAmt:     { type: Number, default: 0 },
  igstAmt:     { type: Number, default: 0 },
  total:       { type: Number, default: 0 }  // amount + tax for this line
}, { _id: false });

const invoiceSchema = new mongoose.Schema({
  invoiceNumber: { type: String, required: true, unique: true },
  invoiceDate:   { type: Date, default: Date.now },
  dueDate:       { type: Date },
  terms:         { type: String, default: 'Due on Receipt' },   // payment terms label
  placeOfSupply: { type: String, default: 'Tamil Nadu (33)' },

  // 'intra' = same state -> CGST + SGST split.  'inter' = different state -> IGST only.
  taxType:       { type: String, enum: ['intra', 'inter'], default: 'intra' },

  billTo: {
    name:    { type: String, required: true, trim: true },
    address: { type: String, default: '' },
    gstin:   { type: String, default: '' },
    phone:   { type: String, default: '' }
  },
  shipTo: {
    name:    { type: String, default: '' },
    address: { type: String, default: '' }
  },

  items: { type: [invoiceItemSchema], required: true },

  subTotal:   { type: Number, required: true },
  totalCgst:  { type: Number, default: 0 },
  totalSgst:  { type: Number, default: 0 },
  totalIgst:  { type: Number, default: 0 },
  rounding:   { type: Number, default: 0 },
  grandTotal: { type: Number, required: true },
  amountInWords: { type: String, default: '' },

  termsConditions: { type: [String], default: [] },
  notes:           { type: String, default: '' },

  status: { type: String, enum: ['unpaid', 'paid', 'cancelled'], default: 'unpaid' }
}, { timestamps: true });

module.exports = mongoose.model('Invoice', invoiceSchema);

