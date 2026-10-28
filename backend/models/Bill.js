const mongoose = require('mongoose');

// Quick counter bill (thermal receipt). No customer details, no stock link.
const billItemSchema = new mongoose.Schema({
  productId: { type: String, default: '' },
  name:      { type: String, required: true, trim: true },   // short English name printed on the bill
  tamilName: { type: String, default: '', trim: true },      // Tamil name printed on the bill
  qty:       { type: Number, required: true, min: 0 },
  rate:      { type: Number, required: true, min: 0 },       // GST-inclusive rate
  amount:    { type: Number, required: true, min: 0 }        // qty * rate (GST-inclusive)
}, { _id: false });

const billSchema = new mongoose.Schema({
  clientId:   { type: String, required: true, unique: true }, // generated on the phone -> saving twice never duplicates a bill
  billNo:     { type: String, required: true, index: true },
  billDate:   { type: Date, default: Date.now },
  items:      { type: [billItemSchema], required: true },
  paymentType:{ type: String, enum: ['cash', 'upi', 'card'], default: 'cash' },
  itemsTotal: { type: Number, required: true },               // sum of item amounts
  adjustment: { type: Number, default: 0 },                   // (typed final total) - itemsTotal
  gstRate:    { type: Number, default: 5 },                   // total GST %, split equally CGST/SGST
  taxable:    { type: Number, required: true },               // total / (1 + gst)
  cgst:       { type: Number, required: true },
  sgst:       { type: Number, required: true },
  total:      { type: Number, required: true }                // = taxable + cgst + sgst, exactly what was entered
}, { timestamps: true });

module.exports = mongoose.model('Bill', billSchema);
