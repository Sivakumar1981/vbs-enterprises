const express  = require('express');
const router   = express.Router();
const auth     = require('../middleware/auth');
const Purchase = require('../models/Purchase');

// GET all purchases (optionally filter by month/year)
router.get('/', auth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const filter = {};
    if (month !== undefined && month !== '' || year !== undefined && year !== '') {
      const start = year ? new Date(parseInt(year), month !== undefined && month !== '' ? parseInt(month) : 0, 1) : null;
      const end   = year ? new Date(parseInt(year), month !== undefined && month !== '' ? parseInt(month) + 1 : 12, 1) : null;
      if (start && end) filter.purchaseDate = { $gte: start, $lt: end };
    }
    const purchases = await Purchase.find(filter).sort({ purchaseDate: -1, createdAt: -1 });
    res.json({ success: true, purchases });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST create new purchase
router.post('/', auth, async (req, res) => {
  try {
    const { purchaseDate, productName, category, quantity, unit, price, notes } = req.body;
    if (!purchaseDate || !productName || !category || quantity === undefined || price === undefined) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    const purchase = await Purchase.create({
      purchaseDate,
      productName,
      category,
      quantity: qty,
      unit: unit || '',
      price: prc,
      totalPrice: qty * prc,
      notes: notes || ''
    });
    res.json({ success: true, purchase });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update existing purchase
router.put('/:id', auth, async (req, res) => {
  try {
    const { purchaseDate, productName, category, quantity, unit, price, notes } = req.body;
    if (!purchaseDate || !productName || !category || quantity === undefined || price === undefined) {
      return res.status(400).json({ success: false, message: 'All fields required' });
    }
    const qty = parseFloat(quantity);
    const prc = parseFloat(price);
    const purchase = await Purchase.findByIdAndUpdate(
      req.params.id,
      {
        purchaseDate, productName, category,
        quantity: qty, unit: unit || '', price: prc,
        totalPrice: qty * prc,
        notes: notes || ''
      },
      { new: true }
    );
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });
    res.json({ success: true, purchase });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE a purchase
router.delete('/:id', auth, async (req, res) => {
  try {
    const purchase = await Purchase.findByIdAndDelete(req.params.id);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
