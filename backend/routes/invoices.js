const express = require('express');
const router  = express.Router();
const Invoice = require('../models/Invoice');
const auth    = require('../middleware/auth');

// GET next invoice number (admin only) — used by the admin form to preview the number before saving
router.get('/next-number', auth, async (req, res) => {
  try {
    const count = await Invoice.countDocuments();
    const next  = `VBS/INV-${String(count + 1).padStart(4, '0')}`;
    res.json({ success: true, invoiceNumber: next });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET all invoices (admin only)
router.get('/', auth, async (req, res) => {
  try {
    const invoices = await Invoice.find().sort({ createdAt: -1 });
    res.json({ success: true, invoices });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single invoice (admin only)
router.get('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, invoice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST create invoice (admin only) — auto-assigns the next sequential invoice number
router.post('/', auth, async (req, res) => {
  try {
    const {
      invoiceDate, dueDate, terms, placeOfSupply, taxType,
      billTo, shipTo, items,
      subTotal, totalCgst, totalSgst, totalIgst, rounding, grandTotal,
      amountInWords, termsConditions, notes
    } = req.body;

    if (!billTo || !billTo.name) return res.status(400).json({ success: false, message: 'Bill To name is required' });
    if (!items || !items.length) return res.status(400).json({ success: false, message: 'At least one item is required' });

    const count = await Invoice.countDocuments();
    const invoiceNumber = `VBS/INV-${String(count + 1).padStart(4, '0')}`;

    const invoice = new Invoice({
      invoiceNumber,
      invoiceDate: invoiceDate ? new Date(invoiceDate) : Date.now(),
      dueDate: dueDate ? new Date(dueDate) : undefined,
      terms: terms || 'Due on Receipt',
      placeOfSupply: placeOfSupply || 'Tamil Nadu (33)',
      taxType: taxType === 'inter' ? 'inter' : 'intra',
      billTo, shipTo: shipTo || {},
      items,
      subTotal, totalCgst: totalCgst || 0, totalSgst: totalSgst || 0, totalIgst: totalIgst || 0,
      rounding: rounding || 0, grandTotal,
      amountInWords: amountInWords || '',
      termsConditions: termsConditions || [],
      notes: notes || ''
    });
    await invoice.save();
    res.status(201).json({ success: true, message: 'Invoice created', invoice });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Invoice number clashed, please try saving again' });
    }
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update invoice status (e.g. mark as paid) (admin only)
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!['unpaid', 'paid', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }
    const invoice = await Invoice.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, message: 'Status updated', invoice });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE invoice (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) return res.status(404).json({ success: false, message: 'Not found' });
    await invoice.deleteOne();
    res.json({ success: true, message: 'Invoice deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
