const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const auth     = require('../middleware/auth');
const Customer = require('../models/Customer');

// ── Admin Login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    if (username !== process.env.ADMIN_USERNAME || password !== process.env.ADMIN_PASSWORD) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, token });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Verify admin token ─────────────────────────────────────────
router.get('/verify', auth, (req, res) => {
  res.json({ success: true, admin: req.admin });
});

// ── Customer Register ──────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, address } = req.body;
    if (!name || !phone || !password) {
      return res.status(400).json({ success: false, message: 'Name, phone and password are required' });
    }
    const exists = await Customer.findOne({ phone });
    if (exists) {
      return res.status(400).json({ success: false, message: 'Phone number already registered' });
    }
    const customer = new Customer({ name, phone, email, password, address });
    await customer.save();
    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({
      success: true,
      token,
      customer: { _id: customer._id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Customer Login (phone OR email) ───────────────────────────
router.post('/customer/login', async (req, res) => {
  try {
    const { phone, email, password } = req.body;
    if ((!phone && !email) || !password) {
      return res.status(400).json({ success: false, message: 'Phone/email and password required' });
    }
    // Find by phone or email
    const query = phone ? { phone } : { email };
    const customer = await Customer.findOne(query);
    if (!customer) {
      return res.status(401).json({ success: false, message: 'Account not found. Please register first.' });
    }
    const match = await customer.matchPassword(password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Wrong password' });
    }
    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      token,
      customer: { _id: customer._id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
