const express    = require('express');
const router     = express.Router();
const Quotation  = require('../models/Quotation');
const auth       = require('../middleware/auth');

// Next number = (highest existing number) + 1. Using countDocuments() breaks after any deletion
// (count+1 can equal a number that already exists -> duplicate key -> save silently fails).
async function nextQuoteNumber() {
  const docs = await Quotation.find({}, 'quoteNumber').lean();
  let max = 0;
  for (const d of docs) {
    const m = /(\d+)\s*$/.exec(d.quoteNumber || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `VBS/Q-${String(max + 1).padStart(4, '0')}`;
}

// GET next quote number (admin only) — used by the admin form to preview the number before saving
router.get('/next-number', auth, async (req, res) => {
  try {
    res.json({ success: true, quoteNumber: await nextQuoteNumber() });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET all quotations (admin only)
router.get('/', auth, async (req, res) => {
  try {
    const quotations = await Quotation.find().sort({ createdAt: -1 });
    res.json({ success: true, quotations });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single quotation (admin only)
router.get('/:id', auth, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, quotation });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST create quotation (admin only) — auto-assigns the next sequential quote number
router.post('/', auth, async (req, res) => {
  try {
    const {
      customerName, customerAddress, customerPhone, customerEmail,
      items, deliveryCost, grandTotal, amountInWords, terms, quoteDate
    } = req.body;

    if (!customerName) return res.status(400).json({ success: false, message: 'Customer name is required' });
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'At least one item is required' });

    // Retry a few times in case two saves race for the same number
    let quotation, lastErr;
    for (let attempt = 0; attempt < 5; attempt++) {
      const quoteNumber = await nextQuoteNumber();
      quotation = new Quotation({
        quoteNumber,
        quoteDate: quoteDate ? new Date(quoteDate) : Date.now(),
        customerName,
        customerAddress: customerAddress || '',
        customerPhone: customerPhone || '',
        customerEmail: customerEmail || '',
        items,
        deliveryCost: deliveryCost || 0,
        grandTotal,
        amountInWords: amountInWords || '',
        terms: terms || []
      });
      try { await quotation.save(); lastErr = null; break; }
      catch (e) { if (e.code === 11000) { lastErr = e; continue; } throw e; }
    }
    if (lastErr) throw lastErr;
    res.status(201).json({ success: true, message: 'Quotation created', quotation });
  } catch (err) {
    if (err.code === 11000) {
      // Extremely rare race condition on quoteNumber uniqueness — ask the client to retry
      return res.status(409).json({ success: false, message: 'Quote number clashed, please try saving again' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE quotation (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const quotation = await Quotation.findById(req.params.id);
    if (!quotation) return res.status(404).json({ success: false, message: 'Not found' });
    await quotation.deleteOne();
    res.json({ success: true, message: 'Quotation deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

