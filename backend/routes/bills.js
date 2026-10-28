const express = require('express');
const router  = express.Router();
const Bill    = require('../models/Bill');
const auth    = require('../middleware/auth');

const r2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Highest bill number used so far for a prefix (phone uses this to stay in sequence)
router.get('/next-number', auth, async (req, res) => {
  try {
    const prefix = String(req.query.prefix || 'B').replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'B';
    const re = new RegExp('^' + prefix + '-(\\d+)$');
    const docs = await Bill.find({ billNo: { $regex: '^' + prefix + '-' } }, 'billNo').sort({ createdAt: -1 }).limit(1000).lean();
    let max = 0;
    for (const d of docs) { const m = re.exec(d.billNo || ''); if (m) max = Math.max(max, parseInt(m[1], 10)); }
    res.json({ success: true, last: max });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// List bills (optional ?from=YYYY-MM-DD&to=YYYY-MM-DD)
router.get('/', auth, async (req, res) => {
  try {
    const q = {};
    if (req.query.from || req.query.to) {
      q.billDate = {};
      if (req.query.from) q.billDate.$gte = new Date(req.query.from + 'T00:00:00');
      if (req.query.to)   q.billDate.$lte = new Date(req.query.to + 'T23:59:59.999');
    }
    const bills = await Bill.find(q).sort({ billDate: -1 }).limit(2000);
    res.json({ success: true, bills });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Save a bill (already printed on the phone). Safe to call repeatedly with the same clientId.
router.post('/', auth, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.clientId || !b.billNo) return res.status(400).json({ success: false, message: 'clientId and billNo required' });
    if (!Array.isArray(b.items) || !b.items.length) return res.status(400).json({ success: false, message: 'At least one item required' });

    const existing = await Bill.findOne({ clientId: b.clientId });
    if (existing) return res.json({ success: true, duplicate: true, bill: existing });

    // GST sanity check: taxable + CGST + SGST must equal the total that was entered
    const total = r2(b.total), parts = r2(b.taxable) + r2(b.cgst) + r2(b.sgst);
    if (!(total >= 0) || Math.abs(parts - total) > 0.011) {
      return res.status(400).json({ success: false, message: 'GST split does not add up to the total' });
    }

    const bill = await Bill.create({
      clientId: b.clientId, billNo: b.billNo,
      billDate: b.billDate ? new Date(b.billDate) : Date.now(),
      items: b.items.map(i => ({
        productId: i.productId || '', name: i.name, tamilName: i.tamilName || '',
        qty: Number(i.qty), rate: Number(i.rate), amount: Number(i.amount)
      })),
      paymentType: ['cash', 'upi', 'card'].includes(b.paymentType) ? b.paymentType : 'cash',
      itemsTotal: r2(b.itemsTotal), adjustment: r2(b.adjustment || 0),
      gstRate: Number(b.gstRate) || 5,
      taxable: r2(b.taxable), cgst: r2(b.cgst), sgst: r2(b.sgst), total
    });
    res.status(201).json({ success: true, bill });
  } catch (err) {
    if (err.code === 11000) return res.json({ success: true, duplicate: true });
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete by the phone's own id (used by "Delete" in Recent bills). Safe if it was never saved.
router.delete('/by-client/:clientId', auth, async (req, res) => {
  try {
    const r = await Bill.deleteOne({ clientId: req.params.clientId });
    res.json({ success: true, deleted: r.deletedCount || 0 });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// Delete a bill (admin)
router.delete('/:id', auth, async (req, res) => {
  try {
    const bill = await Bill.findById(req.params.id);
    if (!bill) return res.status(404).json({ success: false, message: 'Not found' });
    await bill.deleteOne();
    res.json({ success: true, message: 'Bill deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
