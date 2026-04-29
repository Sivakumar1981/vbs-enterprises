const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

const customerSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  phone:    { type: String, required: true, unique: true, trim: true },
  email:    { type: String, trim: true, lowercase: true, default: '', sparse: true },
  password: { type: String, required: true },
  address:  { type: String, default: '' }
}, { timestamps: true });

customerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

customerSchema.methods.matchPassword = async function(entered) {
  return bcrypt.compare(entered, this.password);
};

const Customer = mongoose.model('Customer', customerSchema);

// Drop old email unique index if it exists (fixes duplicate key error)
Customer.collection.dropIndex('email_1').catch(() => {});

module.exports = Customer;
