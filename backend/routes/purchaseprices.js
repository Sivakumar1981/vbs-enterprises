const express = require('express');
const router  = express.Router();
const auth    = require('../middleware/auth');
const PurchasePrice = require('../models/PurchasePrice');

// GET purchase prices for a specific month/year
router.get('/', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = {};
    if (month !== undefined) filter.month = parseInt(month);
    if (year  !== undefined) filter.year  = parseInt(year);
    const prices = await PurchasePrice.find(filter);
    res.json({ success: true, prices });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST/PUT save purchase price for a product for a specific month
router.post('/', auth, async (req, res) => {
  try {
    const { productName, unit, month, year, price } = req.body;
    if (!productName || !unit || month === undefined || !year || price === undefined) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    // Upsert — update if exists, create if not
    const doc = await PurchasePrice.findOneAndUpdate(
      { productName, unit, month: parseInt(month), year: parseInt(year) },
      { $set: { price: parseFloat(price) } },
      { upsert: true, new: true }
    );
    res.json({ success: true, price: doc });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
