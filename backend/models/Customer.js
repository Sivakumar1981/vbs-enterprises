const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const customerSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  phone:    { type: String, required: true, unique: true, trim: true },
  email:    { type: String, trim: true },
  password: { type: String, required: true },
  address:  { type: String, trim: true }
}, { timestamps: true });

customerSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

customerSchema.methods.matchPassword = async function(password) {
  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model('Customer', customerSchema);
