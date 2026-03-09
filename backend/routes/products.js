const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const Product = require('../models/Product');
const { adminAuth } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, 'prod_' + Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// PUBLIC: all active products
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: true };
    if (category) filter.category = category;
    if (search)   filter.name = { $regex: search, $options: 'i' };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: create
router.post('/', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, unit, stock } = req.body;
    if (!name || !category || !price)
      return res.status(400).json({ success: false, message: 'Name, category and price required' });
    const product = await Product.create({
      name, category, description,
      price: parseFloat(price),
      unit: unit || 'per piece',
      stock: parseInt(stock) || 0,
      image: req.file ? req.file.filename : null
    });
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: update
router.put('/:id', adminAuth, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    const { name, category, description, price, unit, stock, isActive } = req.body;
    if (name)        product.name        = name;
    if (category)    product.category    = category;
    if (description !== undefined) product.description = description;
    if (price)       product.price       = parseFloat(price);
    if (unit)        product.unit        = unit;
    if (stock !== undefined) product.stock = parseInt(stock);
    if (isActive !== undefined) product.isActive = isActive === 'true' || isActive === true;
    if (req.file) {
      if (product.image) {
        const old = path.join(__dirname, '../uploads', product.image);
        if (fs.existsSync(old)) fs.unlinkSync(old);
      }
      product.image = req.file.filename;
    }
    await product.save();
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: delete
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    if (product.image) {
      const imgPath = path.join(__dirname, '../uploads', product.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }
    await product.deleteOne();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
