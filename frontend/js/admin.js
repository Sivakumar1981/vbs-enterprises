require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 5000;

// 1. CORS
app.use(cors());

// 2. Remove ngrok warning
app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', '1');
  next();
});

// 3. Body parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 4. Serve uploaded product images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 5. Serve frontend static files
const FE = path.join(__dirname, '../frontend');
app.use(express.static(FE));

// 6. API routes
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/products', require('./routes/products'));
app.use('/api/orders',   require('./routes/orders'));

// 7. Page routes
app.get('/admin', (req, res) => res.sendFile(path.join(FE, 'admin.html')));
app.get('*',      (req, res) => res.sendFile(path.join(FE, 'index.html')));

// 8. Connect MongoDB then start server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅  MongoDB connected successfully');
    app.listen(PORT, '0.0.0.0', () => {
      console.log('');
      console.log('🚀  VBS Enterprises is LIVE!');
      console.log(`    Shop  →  https://vbs-enterprises.onrender.com`);
      console.log(`    Admin →  https://vbs-enterprises.onrender.com/admin`);
      console.log('');
    });
  })
  .catch(err => {
    console.error('❌  MongoDB error:', err.message);
    process.exit(1);
  });
