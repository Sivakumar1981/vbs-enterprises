const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const nodemailer = require('nodemailer');

// ── Email Notification Helper ──────────────────────────────────
async function sendOwnerNotification(order) {
  if (!process.env.EMAIL_USER || process.env.EMAIL_USER === 'your_gmail@gmail.com') return;

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const itemsHtml = order.items
      .map(i => `<tr>
        <td style="padding:8px;border:1px solid #eee">${i.name}</td>
        <td style="padding:8px;border:1px solid #eee">${i.category}</td>
        <td style="padding:8px;border:1px solid #eee">${i.quantity}</td>
        <td style="padding:8px;border:1px solid #eee">₹${i.price}</td>
        <td style="padding:8px;border:1px solid #eee">₹${i.price * i.quantity}</td>
      </tr>`).join('');

    await transporter.sendMail({
      from: `"VBS Enterprises" <${process.env.EMAIL_USER}>`,
      to: process.env.OWNER_EMAIL,
      subject: `🛍️ New Order ${order.orderId} — ₹${order.totalAmount}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;border:1px solid #ddd;border-radius:8px;overflow:hidden">
          <div style="background:#1a0f00;padding:20px;text-align:center">
            <h1 style="color:#e8c068;margin:0">VBS Enterprises</h1>
            <p style="color:#aaa;margin:5px 0">New Order Received!</p>
          </div>
          <div style="padding:24px">
            <h2 style="color:#333">Order ${order.orderId}</h2>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <tr style="background:#f5e6cc">
                <th style="padding:8px;border:1px solid #eee;text-align:left">Product</th>
                <th style="padding:8px;border:1px solid #eee">Category</th>
                <th style="padding:8px;border:1px solid #eee">Qty</th>
                <th style="padding:8px;border:1px solid #eee">Price</th>
                <th style="padding:8px;border:1px solid #eee">Total</th>
              </tr>
              ${itemsHtml}
            </table>
            <p><strong>Total Amount:</strong> ₹${order.totalAmount}</p>
            <hr/>
            <h3>Customer Details</h3>
            <p><strong>Name:</strong> ${order.customer.name}</p>
            <p><strong>Phone:</strong> ${order.customer.phone}</p>
            <p><strong>Address:</strong> ${order.customer.address}</p>
            <p><strong>Payment:</strong> ${order.paymentMethod.toUpperCase()}</p>
            ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
          </div>
          <div style="background:#f9f9f9;padding:16px;text-align:center">
            <p style="color:#888;font-size:12px">Login to Admin Panel to manage this order</p>
          </div>
        </div>
      `
    });
  } catch (err) {
    console.error('Email notification failed:', err.message);
  }
}

// ── PUBLIC: Place new order ────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { customer: rawCustomer, items, paymentMethod, notes, deliveryAddress } = req.body;

    // Build customer object — support flat format from frontend
    const customer = rawCustomer || {};
    if (deliveryAddress && !customer.address) customer.address = deliveryAddress;

    if (!customer?.name || !customer?.phone || !customer?.address) {
      return res.status(400).json({ success: false, message: 'Customer name, phone, and address required' });
    }
    if (!items || !items.length) {
      return res.status(400).json({ success: false, message: 'Order must have at least one item' });
    }

    // Validate products and build order items
    let totalAmount = 0;
    const orderItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product || !product.isActive) {
        return res.status(400).json({ success: false, message: `Product not found: ${item.productId}` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({ success: false, message: `Insufficient stock for ${product.name}` });
      }
      orderItems.push({
        product: product._id,
        name: product.name,
        price: product.price,
        quantity: item.quantity,
        image: product.image,
        category: product.category
      });
      totalAmount += product.price * item.quantity;

      // Reduce stock
      product.stock -= item.quantity;
      await product.save();
    }

    const order = new Order({
      customer,
      items: orderItems,
      totalAmount,
      paymentMethod: paymentMethod || 'cod',
      notes: notes || ''
    });

    await order.save();

    // Send notification to owner
    sendOwnerNotification(order);

    res.status(201).json({
      success: true,
      message: 'Order placed successfully!',
      orderId: order.orderId,
      order
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── PUBLIC: Get order by orderId (for customer tracking) ────────
router.get('/track/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── CUSTOMER: Get my orders by phone (no auth needed, use phone) ──
router.get('/my', async (req, res) => {
  try {
    const { phone } = req.query;
    if (!phone) return res.status(400).json({ success: false, message: 'Phone required' });
    const orders = await Order.find({ 'customer.phone': phone }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get all orders ──────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Order.countDocuments(filter);
    res.json({ success: true, orders, total, page: parseInt(page) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get dashboard stats ─────────────────────────────────
router.get('/stats/summary', auth, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const newOrders = await Order.countDocuments({ status: 'new' });
    const revenue = await Order.aggregate([
      { $match: { status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalProducts = await Product.countDocuments({ isActive: true });

    res.json({
      success: true,
      stats: {
        totalOrders,
        newOrders,
        totalRevenue: revenue[0]?.total || 0,
        totalProducts
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Update order status ─────────────────────────────────
router.put('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['new', 'confirmed', 'processing', 'ready', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

    // If cancelled, restore stock
    if (status === 'cancelled') {
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, { $inc: { stock: item.quantity } });
      }
    }

    res.json({ success: true, message: 'Status updated', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get all customers (unique from orders) ──────────────
router.get('/customers', auth, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    const customerMap = {};
    for (const o of orders) {
      const phone = o.customer?.phone;
      if (!phone) continue;
      if (!customerMap[phone]) {
        customerMap[phone] = {
          name: o.customer.name,
          phone: o.customer.phone,
          address: o.customer.address,
          orders: 0,
          totalSpent: 0,
          lastOrder: o.createdAt
        };
      }
      customerMap[phone].orders += 1;
      if (o.status !== 'cancelled') customerMap[phone].totalSpent += o.totalAmount;
      if (o.createdAt > customerMap[phone].lastOrder) customerMap[phone].lastOrder = o.createdAt;
    }
    const customers = Object.values(customerMap);
    res.json({ success: true, customers });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get orders by customer phone ────────────────────────
router.get('/customers/:phone', auth, async (req, res) => {
  try {
    const orders = await Order.find({ 'customer.phone': req.params.phone }).sort({ createdAt: -1 });
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
