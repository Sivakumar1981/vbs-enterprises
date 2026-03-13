const express    = require('express');
const router     = express.Router();
const cloudinary = require('cloudinary').v2;
const multer     = require('multer');
const Product    = require('../models/Product');
const auth       = require('../middleware/auth');

// Cloudinary Config
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Multer - memory storage then upload to Cloudinary
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }
});

// Upload to Cloudinary helper
async function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      { folder: 'vbs-enterprises', resource_type: 'image' },
      (error, result) => {
        if (error) reject(error);
        else resolve(result.secure_url);
      }
    ).end(buffer);
  });
}

// GET all products
router.get('/', async (req, res) => {
  try {
    const { category, search } = req.query;
    const filter = { isActive: { $ne: false } };
    if (category) filter.category = category;
    if (search)   filter.name = { $regex: search, $options: 'i' };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, products });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// GET single product
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    res.json({ success: true, product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// POST create product
router.post('/', auth, upload.single('image'), async (req, res) => {
  try {
    const { name, category, description, price, unit, stock } = req.body;
    if (!name || !category || !price)
      return res.status(400).json({ success: false, message: 'Name, category and price required' });
    let imageUrl = null;
    if (req.file) imageUrl = await uploadToCloudinary(req.file.buffer);
    const product = new Product({
      name, category, description,
      price: parseFloat(price),
      unit:  unit || 'per piece',
      stock: parseInt(stock) || 0,
      image: imageUrl
    });
    await product.save();
    res.status(201).json({ success: true, message: 'Product created', product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// PUT update product
router.put('/:id', auth, upload.single('image'), async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    const { name, category, description, price, unit, stock, isActive } = req.body;
    if (name)                    product.name        = name;
    if (category)                product.category    = category;
    if (description !== undefined) product.description = description;
    if (price)                   product.price       = parseFloat(price);
    if (unit)                    product.unit        = unit;
    if (stock !== undefined)     product.stock       = parseInt(stock);
    if (isActive !== undefined)  product.isActive    = isActive === 'true' || isActive === true;
    if (req.file)                product.image       = await uploadToCloudinary(req.file.buffer);
    await product.save();
    res.json({ success: true, message: 'Product updated', product });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// DELETE product
router.delete('/:id', auth, async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Not found' });
    await product.deleteOne();
    res.json({ success: true, message: 'Product deleted' });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
