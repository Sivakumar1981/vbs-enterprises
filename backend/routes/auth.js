const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const Customer = require('../models/Customer');
const { adminAuth, customerAuth } = require('../middleware/auth');

// ── ADMIN LOGIN ───────────────────────────────────────
router.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    return res.json({ success: true, token });
  }
  res.status(401).json({ success: false, message: 'Invalid admin credentials' });
});

router.get('/admin/verify', adminAuth, (req, res) => {
  res.json({ success: true });
});

// ── CUSTOMER REGISTER ─────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, phone, email, password, address } = req.body;
    if (!name || !phone || !email || !password)
      return res.status(400).json({ success: false, message: 'All fields required' });

    const exists = await Customer.findOne({ email: email.toLowerCase() });
    if (exists)
      return res.status(400).json({ success: false, message: 'Email already registered. Please login.' });

    const customer = await Customer.create({ name, phone, email, password, address: address || '' });
    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ success: true, token, customer: { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CUSTOMER LOGIN ────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: 'Email and password required' });

    const customer = await Customer.findOne({ email: email.toLowerCase() });
    if (!customer)
      return res.status(401).json({ success: false, message: 'No account found with this email' });

    const ok = await customer.matchPassword(password);
    if (!ok)
      return res.status(401).json({ success: false, message: 'Wrong password' });

    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token, customer: { id: customer._id, name: customer.name, email: customer.email, phone: customer.phone, address: customer.address } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CUSTOMER PROFILE ──────────────────────────────────
router.get('/me', customerAuth, async (req, res) => {
  try {
    const customer = await Customer.findById(req.customer.id).select('-password');
    if (!customer) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── UPDATE PROFILE ────────────────────────────────────
router.put('/me', customerAuth, async (req, res) => {
  try {
    const { name, phone, address } = req.body;
    const customer = await Customer.findByIdAndUpdate(
      req.customer.id,
      { name, phone, address },
      { new: true }
    ).select('-password');
    res.json({ success: true, customer });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
