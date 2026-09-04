const mongoose = require('mongoose');

const quotationItemSchema = new mongoose.Schema({
  particulars: { type: String, required: true, trim: true },
  qty:         { type: Number, required: true, min: 0 },
  unit:        { type: String, default: 'Tin' },
  rate:        { type: Number, required: true, min: 0 },
  amount:      { type: Number, required: true, min: 0 }
}, { _id: false });

const quotationSchema = new mongoose.Schema({
  quoteNumber:    { type: String, required: true, unique: true },
  quoteDate:      { type: Date, default: Date.now },

  customerName:    { type: String, required: true, trim: true },
  customerAddress: { type: String, default: '' },
  customerPhone:   { type: String, default: '' },
  customerEmail:   { type: String, default: '' },

  items:          { type: [quotationItemSchema], required: true },
  deliveryCost:   { type: Number, default: 0 },
  grandTotal:     { type: Number, required: true },
  amountInWords:  { type: String, default: '' },

  terms:          { type: [String], default: [] },

  status:         { type: String, enum: ['draft', 'sent', 'confirmed', 'expired'], default: 'sent' }
}, { timestamps: true });

module.exports = mongoose.model('Quotation', quotationSchema);

