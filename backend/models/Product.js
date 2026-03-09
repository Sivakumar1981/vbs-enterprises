const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name:        { type: String, required: true, trim: true },
  category:    { type: String, enum: ['clothes','oil','rice','other'], required: true },
  description: { type: String, default: '' },
  price:       { type: Number, required: true, min: 0 },
  unit:        { type: String, default: 'per piece' },
  stock:       { type: Number, default: 0, min: 0 },
  image:       { type: String, default: null },
  isActive:    { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
