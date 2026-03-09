const mongoose = require('mongoose');

const itemSchema = new mongoose.Schema({
  product:  { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name:     String,
  price:    Number,
  quantity: { type: Number, required: true, min: 1 },
  image:    String,
  category: String
});

const orderSchema = new mongoose.Schema({
  orderId:  { type: String, unique: true },
  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', required: true },
  customerSnapshot: {
    name:    String,
    phone:   String,
    email:   String,
    address: String
  },
  items:         [itemSchema],
  totalAmount:   { type: Number, required: true },
  paymentMethod: { type: String, enum: ['cod','upi','bank'], default: 'cod' },
  status:        { type: String, enum: ['new','confirmed','processing','ready','delivered','cancelled'], default: 'new' },
  notes:         { type: String, default: '' }
}, { timestamps: true });

orderSchema.pre('save', async function(next) {
  if (!this.orderId) {
    const count = await mongoose.model('Order').countDocuments();
    this.orderId = 'VBS-' + String(count + 1001).padStart(4, '0');
  }
  next();
});

module.exports = mongoose.model('Order', orderSchema);
