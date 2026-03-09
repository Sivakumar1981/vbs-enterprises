const express = require('express');
const router  = express.Router();
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer  = require('multer');
const Product = require('../models/Product');
const { adminAuth } = require('../middleware/auth');

// Cloudinary config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'dha9sqdqu',
  api_key:    process.env.CLOUDINARY_API_KEY    || '454567653639659',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'qqQwMPv91vEPXn9cCFYg4uZD5Q0'
});

// Cloudinary storage
const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'vbs-enterprises',
    allowed_formats: ['jpg','jpeg','png','webp'],
    transformation: [{ width:800, height:800, crop:'limit', quality:'auto' }]
  }
});

const upload = multer({ storage, limits:{ fileSize: 5*1024*1024 } });

// PUBLIC: get all products
router.get('/', async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.category) filter.category = req.query.category;
    if (req.query.search)   filter.name = { $regex: req.query.search, $options: 'i' };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUBLIC: single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: create product
router.post('/', adminAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const { name, category, subCategory, description, price, unit, stock } = req.body;
    if (!name || !category || !price)
      return res.status(400).json({ success: false, message: 'Name, category, price required' });
    const product = await Product.create({
      name, category,
      subCategory: subCategory || '',
      description: description || '',
      price:   parseFloat(price),
      unit:    unit || 'per piece',
      stock:   parseInt(stock) || 0,
      image:   req.file ? req.file.path : null  // Cloudinary full URL
    });
    res.status(201).json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: update product
router.put('/:id', adminAuth, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message });
    next();
  });
}, async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Not found' });
    if (req.body.name)        p.name        = req.body.name;
    if (req.body.category)    p.category    = req.body.category;
    if (req.body.subCategory !== undefined) p.subCategory = req.body.subCategory;
    if (req.body.description !== undefined) p.description = req.body.description;
    if (req.body.unit)        p.unit        = req.body.unit;
    if (req.body.price)       p.price       = parseFloat(req.body.price);
    if (req.body.stock !== undefined)    p.stock    = parseInt(req.body.stock);
    if (req.body.isActive !== undefined) p.isActive = req.body.isActive === 'true' || req.body.isActive === true;
    if (req.file) p.image = req.file.path; // new Cloudinary URL
    await p.save();
    res.json({ success: true, product: p });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: delete product
router.delete('/:id', adminAuth, async (req, res) => {
  try {
    const p = await Product.findById(req.params.id);
    if (!p) return res.status(404).json({ success: false, message: 'Not found' });
    // Delete image from Cloudinary
    if (p.image && p.image.includes('cloudinary')) {
      const parts  = p.image.split('/');
      const file   = parts[parts.length - 1];
      const pubId  = 'vbs-enterprises/' + file.split('.')[0];
      await cloudinary.uploader.destroy(pubId).catch(() => {});
    }
    await p.deleteOne();
    res.json({ success: true, message: 'Deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
