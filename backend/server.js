require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Uploads folder
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── API routes FIRST (before static files) ──
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));
app.use('/api/purchaseprices', require('./routes/purchaseprices'));

// ── Frontend static files AFTER API routes ──
const FE = path.join(__dirname, '../frontend');
app.use(express.static(FE));
app.get('/admin', (req, res) => res.sendFile(path.join(FE, 'admin.html')));
app.get('*',      (req, res) => res.sendFile(path.join(FE, 'index.html')));

mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n🚀 VBS Enterprises Server running!`);
      console.log(`   Local:   http://localhost:${PORT}`);
      console.log(`   Shop:    http://localhost:${PORT}/`);
      console.log(`   Admin:   http://localhost:${PORT}/admin`);
      console.log(`\n📱 To share with customers on same WiFi:`);
      console.log(`   Find your IP: run "ipconfig" (Windows) or "ifconfig" (Mac/Linux)`);
      console.log(`   Share: http://YOUR_IP:${PORT}\n`);
    });
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    process.exit(1);
  });
