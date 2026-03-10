const express  = require('express');
const router   = express.Router();
const jwt      = require('jsonwebtoken');
const bcrypt   = require('bcryptjs');
const auth     = require('../middleware/auth');
const Customer = require('../models/Customer');

// ── Admin Login ────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password required' });
    }
    const validUser = username === process.env.ADMIN_USERNAME;
    const validPass = password === process.env.ADMIN_PASSWORD;
    if (!validUser || !validPass) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    const token = jwt.sign({ username, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
    res.json({ success: true, message: 'Login successful', token, expiresIn: '24h' });
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
      message: 'Account created successfully',
      token,
      customer: { _id: customer._id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── Customer Login ─────────────────────────────────────────────
router.post('/customer/login', async (req, res) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) {
      return res.status(400).json({ success: false, message: 'Phone and password required' });
    }
    const customer = await Customer.findOne({ phone });
    if (!customer) {
      return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    }
    const match = await customer.matchPassword(password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid phone or password' });
    }
    const token = jwt.sign({ id: customer._id, role: 'customer' }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({
      success: true,
      message: 'Login successful',
      token,
      customer: { _id: customer._id, name: customer.name, phone: customer.phone, email: customer.email, address: customer.address }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
