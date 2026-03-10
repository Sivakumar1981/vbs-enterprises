require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Serve uploaded images ──────────────────────────────────────
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Serve frontend static files ────────────────────────────────
app.use(express.static(path.join(__dirname, '../frontend')));

// ── API Routes ─────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));

// ── Serve frontend pages ───────────────────────────────────────
const frontend = path.join(__dirname, '../frontend');

app.get('/',        (req, res) => res.sendFile(path.join(frontend, 'index.html')));
app.get('/admin',   (req, res) => res.sendFile(path.join(frontend, 'admin.html')));
app.get('/cart',    (req, res) => res.sendFile(path.join(frontend, 'index.html')));
app.get('/orders',  (req, res) => res.sendFile(path.join(frontend, 'index.html')));

// ── MongoDB Connection ─────────────────────────────────────────
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
