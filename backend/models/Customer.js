const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const customerSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  phone:    { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  address:  { type: String, default: '' }
}, { timestamps: true });

// Hash password before saving
customerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
customerSchema.methods.matchPassword = function(plain) {
  return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('Customer', customerSchema);
