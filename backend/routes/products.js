const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Product = require('../models/Product');
const auth = require('../middleware/auth');

// ── Multer config ──────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'product_' + Date.now() + ext);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|webp/;
    if (allowed.test(path.extname(file.originalname).toLowerCase())) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, WEBP images allowed'));
    }
  }
});

// ── PUBLIC: Get all active products ───────────────────────────
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: { $ne: false } };
    if (category) filter.category = category;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUBLIC: Get single product ─────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Create product ──────────────────────────────────────
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, unit, stock } = req.body;
    if (!name || !category || !price) {
      return res.status(400).json({ success: false, message: 'Name, category and price are required' });
    }

    const product = new Product({
      name,
      category,
      description,
      price: parseFloat(price),
      unit: unit || (category === 'oil' ? 'per litre' : 'per piece'),
      stock: parseInt(stock) || 0,
      image: req.file ? req.file.filename : null
    });

    await product.save();
    res.status(201).json({ success: true, message: 'Product created', product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Update product ──────────────────────────────────────
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { name, category, description, price, unit, stock, isActive } = req.body;

    if (name) product.name = name;
    if (category) product.category = category;
    if (description !== undefined) product.description = description;
    if (price) product.price = parseFloat(price);
    if (unit) product.unit = unit;
    if (stock !== undefined) product.stock = parseInt(stock);
    if (isActive !== undefined) product.isActive = isActive === 'true' || isActive === true;

    if (req.file) {
      // Delete old image
      if (product.image) {
        const oldPath = path.join(__dirname, '../uploads', product.image);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      }
      product.image = req.file.filename;
    }

    await product.save();
    res.json({ success: true, message: 'Product updated', product });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Delete product ──────────────────────────────────────
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    // Delete image file
    if (product.image) {
      const imgPath = path.join(__dirname, '../uploads', product.image);
      if (fs.existsSync(imgPath)) fs.unlinkSync(imgPath);
    }

    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
