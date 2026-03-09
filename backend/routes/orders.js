const express    = require('express');
const router     = express.Router();
const Order      = require('../models/Order');
const Product    = require('../models/Product');
const Customer   = require('../models/Customer');
const { adminAuth, customerAuth } = require('../middleware/auth');
const nodemailer = require('nodemailer');

async function notifyOwner(order) {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER.includes('your_gmail')) return;
  try {
    const transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS } });
    const rows = order.items.map(i => `<tr><td style="padding:6px;border:1px solid #eee">${i.name}</td><td style="padding:6px;border:1px solid #eee">${i.quantity}</td><td style="padding:6px;border:1px solid #eee">₹${i.price * i.quantity}</td></tr>`).join('');
    await transporter.sendMail({
      from: `"VBS Enterprises" <${process.env.EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `🛍️ New Order ${order.orderId} — ₹${order.totalAmount}`,
      html: `<div style="font-family:Arial;max-width:600px;margin:auto">
        <div style="background:#1a0f00;padding:20px;text-align:center"><h1 style="color:#e8c068">VBS Enterprises</h1><p style="color:#aaa">New Order!</p></div>
        <div style="padding:20px">
          <h2>Order ${order.orderId}</h2>
          <table style="width:100%;border-collapse:collapse">${rows}</table>
          <p><strong>Total: ₹${order.totalAmount}</strong></p>
          <p><strong>Customer:</strong> ${order.customerSnapshot.name} | ${order.customerSnapshot.phone}</p>
          <p><strong>Address:</strong> ${order.customerSnapshot.address}</p>
          <p><strong>Payment:</strong> ${order.paymentMethod.toUpperCase()}</p>
        </div>
      </div>`
    });
  } catch (e) { console.error('Email failed:', e.message); }
}

// CUSTOMER: place order
router.post('/', customerAuth, async (req, res) => {
  try {
    const { items, paymentMethod, notes, deliveryAddress } = req.body;
    if (!items?.length) return res.status(400).json({ success: false, message: 'No items in order' });

    const customer = await Customer.findById(req.customer.id);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) return res.status(400).json({ success: false, message: `Product not available` });
      if (product.stock < item.quantity) return res.status(400).json({ success: false, message: `Only ${product.stock} units of ${product.name} in stock` });
      orderItems.push({ product: product._id, name: product.name, price: product.price, quantity: item.quantity, image: product.image, category: product.category });
      totalAmount += product.price * item.quantity;
      product.stock -= item.quantity;
      await product.save();
    }

    const order = await Order.create({
      customer: customer._id,
      customerSnapshot: { name: customer.name, phone: customer.phone, email: customer.email, address: deliveryAddress || customer.address },
      items: orderItems,
      totalAmount,
      paymentMethod: paymentMethod || 'cod',
      notes: notes || ''
    });

    notifyOwner(order);
    res.status(201).json({ success: true, orderId: order.orderId, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// CUSTOMER: my orders
router.get('/my', customerAuth, async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.customer.id }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// CUSTOMER: track by orderId
router.get('/track/:orderId', customerAuth, async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId, customer: req.customer.id });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: all orders
router.get('/', adminAuth, async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: stats
router.get('/stats/summary', adminAuth, async (req, res) => {
  try {
    const totalOrders    = await Order.countDocuments();
    const newOrders      = await Order.countDocuments({ status: 'new' });
    const totalProducts  = await Product.countDocuments({ isActive: true });
    const totalCustomers = await Customer.countDocuments();
    const rev = await Order.aggregate([{ $match: { status: { $ne: 'cancelled' } } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]);
    res.json({ success: true, stats: { totalOrders, newOrders, totalProducts, totalCustomers, totalRevenue: rev[0]?.total || 0 } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: update status
router.put('/:id/status', adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!order) return res.status(404).json({ success: false, message: 'Not found' });
    if (status === 'cancelled') {
      for (const item of order.items) await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
    }
    res.json({ success: true, order });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ADMIN: all customers
router.get('/customers/all', adminAuth, async (req, res) => {
  try {
    const customers = await Customer.find().select('-password').sort({ createdAt: -1 });
    res.json({ success: true, customers });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;
