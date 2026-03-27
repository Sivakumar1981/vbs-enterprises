const mongoose = require('mongoose');

const purchasePriceSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true },
  unit:        { type: String, required: true, trim: true },
  month:       { type: Number, required: true }, // 0-11
  year:        { type: Number, required: true },
  price:       { type: Number, required: true, min: 0 }
}, { timestamps: true });

// One price per product+unit per month+year
purchasePriceSchema.index({ productName: 1, unit: 1, month: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('PurchasePrice', purchasePriceSchema);
