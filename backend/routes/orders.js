const express = require('express');
const router = express.Router();
const Order = require('../models/Order');
const Product = require('../models/Product');
const auth = require('../middleware/auth');
const jwt  = require('jsonwebtoken');
const nodemailer = require('nodemailer');

// ── Email Notification Helper ──────────────────────────────────
async function sendOwnerNotification(order) {
  const emailUser = process.env.EMAIL_USER;
  const emailPass = process.env.EMAIL_PASS;
  if (!emailUser || !emailPass || emailUser === 'your_gmail@gmail.com') {
    console.log('Email not configured - skipping notification');
    return;
  }

  const TO_EMAIL = 'vbsenterprise7@gmail.com';

  const itemRows = order.items.map(i =>
    '<tr>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e8d5b8">' + i.name + '</td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e8d5b8;text-align:center">' + i.quantity + '</td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e8d5b8;text-align:right">Rs.' + i.price.toLocaleString('en-IN') + '</td>' +
    '<td style="padding:8px 12px;border-bottom:1px solid #e8d5b8;text-align:right;font-weight:700">Rs.' + (i.price * i.quantity).toLocaleString('en-IN') + '</td>' +
    '</tr>'
  ).join('');

  const subject = 'New Order ' + order.orderId + ' - Rs.' + order.totalAmount.toLocaleString('en-IN') + ' - ' + order.customer.name;

  const html =
    '<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">' +
    '<div style="background:#1a0f00;padding:1.5rem 2rem;border-radius:8px 8px 0 0;text-align:center">' +
    '<h1 style="color:#e8c068;margin:0;font-size:1.5rem">New Order Received!</h1>' +
    '<p style="color:#b0a090;margin:.25rem 0 0">VBS Enterprises</p>' +
    '</div>' +
    '<div style="background:#fff8f0;padding:1.5rem 2rem;border:1px solid #e8d5b8;border-top:none">' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:1rem">' +
    '<tr><td style="padding:6px 0;color:#8a7060;width:100px">Order ID</td><td style="font-weight:700;color:#c8902a">' + order.orderId + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#8a7060">Total</td><td style="font-weight:700">Rs.' + order.totalAmount.toLocaleString('en-IN') + '</td></tr>' +
    '<tr><td style="padding:6px 0;color:#8a7060">Payment</td><td>' + (order.paymentMethod === 'cod' ? 'Cash on Delivery' : order.paymentMethod.toUpperCase()) + '</td></tr>' +
    '</table>' +
    '<hr style="border:1px solid #e8d5b8;margin:1rem 0"/>' +
    '<h3 style="margin:0 0 .5rem;color:#1a0f00">Customer</h3>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:1rem">' +
    '<tr><td style="padding:5px 0;color:#8a7060;width:80px">Name</td><td style="font-weight:600">' + order.customer.name + '</td></tr>' +
    '<tr><td style="padding:5px 0;color:#8a7060">Phone</td><td>' + order.customer.phone + '</td></tr>' +
    '<tr><td style="padding:5px 0;color:#8a7060">Address</td><td>' + order.customer.address + '</td></tr>' +
    (order.notes ? '<tr><td style="padding:5px 0;color:#8a7060">Notes</td><td style="font-style:italic">' + order.notes + '</td></tr>' : '') +
    '</table>' +
    '<hr style="border:1px solid #e8d5b8;margin:1rem 0"/>' +
    '<h3 style="margin:0 0 .5rem;color:#1a0f00">Items Ordered</h3>' +
    '<table style="width:100%;border-collapse:collapse;margin-bottom:1rem">' +
    '<thead><tr style="background:#1a0f00">' +
    '<th style="padding:8px 12px;color:#e8c068;text-align:left">Item</th>' +
    '<th style="padding:8px 12px;color:#e8c068;text-align:center">Qty</th>' +
    '<th style="padding:8px 12px;color:#e8c068;text-align:right">Price</th>' +
    '<th style="padding:8px 12px;color:#e8c068;text-align:right">Total</th>' +
    '</tr></thead>' +
    '<tbody>' + itemRows + '</tbody>' +
    '<tfoot><tr style="background:#1a0f00">' +
    '<td colspan="3" style="padding:10px 12px;color:#e8c068;font-weight:700;text-align:right">Grand Total</td>' +
    '<td style="padding:10px 12px;color:#e8c068;font-weight:700;text-align:right">Rs.' + order.totalAmount.toLocaleString('en-IN') + '</td>' +
    '</tr></tfoot>' +
    '</table>' +
    '<div style="text-align:center;margin-top:1rem">' +
    '<a href="https://vbs-enterprises-92sz.onrender.com/admin" style="background:#c8902a;color:#fff;text-decoration:none;padding:.7rem 2rem;border-radius:8px;font-weight:700;display:inline-block">Open Admin Panel</a>' +
    '</div></div></div>';

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: emailUser, pass: emailPass }
  });

  transporter.sendMail({
    from: '"VBS Enterprises" <' + emailUser + '>',
    to: TO_EMAIL,
    subject: subject,
    html: html
  }, function(err, info) {
    if (err) {
      console.log('Email failed:', err.message);
    } else {
      console.log('Order notification sent to', TO_EMAIL, '- Order:', order.orderId);
    }
  });
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

// ── CUSTOMER: Get my orders (JWT auth or phone query) ──
router.get('/my', async (req, res) => {
  try {
    const { phone } = req.query;
    let orders;
    if (phone) {
      // Old method: phone in query
      orders = await Order.find({ 'customer.phone': phone }).sort({ createdAt: -1 });
    } else {
      // New method: JWT token → get customer from DB
      const authHeader = req.headers.authorization;
      if (!authHeader) return res.status(400).json({ success: false, message: 'Phone required' });
      const decoded = jwt.verify(authHeader.replace('Bearer ', ''), process.env.JWT_SECRET);
      // Load Customer model only when needed
      const Customer = require('../models/Customer');
      const customer = await Customer.findById(decoded.id);
      if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });
      orders = await Order.find({ 'customer.phone': customer.phone }).sort({ createdAt: -1 });
    }
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ── ADMIN: Get all orders ──────────────────────────────────────
router.get('/', auth, async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const filter = {};
    if (status) filter.status = status;

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(Math.min(parseInt(limit), 9999));

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

// ── ADMIN: Update order amount (discount) ─────────────────────
router.put('/:id/amount', auth, async (req, res) => {
  try {
    const { totalAmount, discount, originalAmount, discountReason, discountedItem, courierCharge } = req.body;
    if (totalAmount === undefined || totalAmount < 0) {
      return res.status(400).json({ success: false, message: 'Invalid amount' });
    }
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { $set: { totalAmount, discount: discount||0, originalAmount: originalAmount||totalAmount,
        discountReason: discountReason||'', discountedItem: discountedItem||'', courierCharge: courierCharge||0 } },
      { new: true }
    );
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: 'Amount updated', order });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
