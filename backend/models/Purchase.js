const mongoose = require('mongoose');

const purchaseSchema = new mongoose.Schema({
  purchaseDate: { type: Date, required: true },
  productName:  { type: String, required: true, trim: true },
  category:     { type: String, required: true, trim: true },
  quantity:     { type: Number, required: true, min: 0 },
  unit:         { type: String, default: '' },
  price:        { type: Number, required: true, min: 0 }, // price per unit
  totalPrice:   { type: Number, required: true, min: 0 }, // quantity * price
  notes:        { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Purchase', purchaseSchema);
