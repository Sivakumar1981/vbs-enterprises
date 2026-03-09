/* ====================================================
   VBS Enterprises — Admin Panel JS (local uploads)
   ==================================================== */

const API = '/api';
let token = localStorage.getItem('vbs_admin_token');
let allProducts = [];
let editingProductId = null;

// ── Helper: image URL (local /uploads/ only) ──────────────────
function imgUrl(image) {
  if (!image) return null;
  if (image.startsWith('http')) return image;   // safety fallback
  return '/uploads/' + image;
}

// ── AUTH ──────────────────────────────────────────────────────
async function doLogin() {
  const user = document.getElementById('l-user').value.trim();
  const pass = document.getElementById('l-pass').value;
  const btn  = document.getElementById('login-btn');
  if (!user || !pass) { showErr('Enter username and password'); return; }
  btn.textContent = 'Logging in...'; btn.disabled = true;
  try {
    const res  = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    token = data.token;
    localStorage.setItem('vbs_admin_token', token);
    showApp();
  } catch(e) {
    showErr(e.message);
    btn.textContent = 'Login →'; btn.disabled = false;
  }
}

function showErr(msg) {
  const el = document.getElementById('l-err');
  el.textContent = msg; el.style.display = 'block';
}

function logout() {
  localStorage.removeItem('vbs_admin_token'); token = null;
  document.getElementById('admin-app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
}

async function showApp() {
  try {
    const res  = await fetch(`${API}/auth/verify`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) throw new Error();
  } catch { logout(); return; }
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('admin-app').style.display = 'flex';
  showTab('dashboard');
}

if (token) showApp();
document.getElementById('l-pass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });

// ── TABS ──────────────────────────────────────────────────────
document.querySelectorAll('.sn-btn').forEach(btn => btn.addEventListener('click', () => showTab(btn.dataset.tab)));

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.sn-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');
  const titles = {
    dashboard: ['Dashboard', 'Overview'],
    products:  ['Products',  'Manage your products'],
    orders:    ['Orders',    'Manage customer orders']
  };
  document.getElementById('topbar-title').textContent = titles[tab]?.[0] || '';
  document.getElementById('topbar-sub').textContent   = titles[tab]?.[1] || '';
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'products')  loadAdminProducts();
  if (tab === 'orders')    loadOrders();
  document.getElementById('sidebar').classList.remove('open');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ── DASHBOARD ─────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const [sRes, oRes] = await Promise.all([
      fetch(`${API}/orders/stats/summary`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`${API}/orders?limit=5`,       { headers: { Authorization: `Bearer ${token}` } })
    ]);
    const sd = await sRes.json(), od = await oRes.json();
    if (sd.success) {
      const s = sd.stats;
      document.getElementById('stats-grid').innerHTML = `
        <div class="stat-card"><div class="stat-num">${s.totalProducts}</div><div class="stat-label">Products</div></div>
        <div class="stat-card"><div class="stat-num">${s.totalOrders}</div><div class="stat-label">Total Orders</div></div>
        <div class="stat-card"><div class="stat-num" style="color:#f87171">${s.newOrders}</div><div class="stat-label">New Orders</div></div>
        <div class="stat-card"><div class="stat-num">₹${s.totalRevenue.toLocaleString('en-IN')}</div><div class="stat-label">Revenue</div></div>`;
    }
    if (od.success) {
      const div = document.getElementById('dash-orders');
      div.innerHTML = od.orders.length
        ? `<div class="orders-list">${od.orders.map(o => orderCardHTML(o)).join('')}</div>`
        : `<div class="empty-state"><div class="big-icon">📋</div><h3>No orders yet</h3></div>`;
    }
  } catch(err) { showToast('❌', err.message); }
}

// ── PRODUCTS ──────────────────────────────────────────────────
async function loadAdminProducts() {
  const res  = await fetch(`${API}/products?`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await res.json();
  if (!data.success) { showToast('❌', data.message); return; }
  allProducts = data.products;
  renderAdminProductTable(allProducts);
}

function filterAdminProducts() {
  const q = document.getElementById('prod-search').value.toLowerCase();
  renderAdminProductTable(q ? allProducts.filter(p => p.name.toLowerCase().includes(q)) : allProducts);
}

function renderAdminProductTable(prods) {
  const tbody = document.getElementById('prod-tbody');
  if (!prods.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:2.5rem;color:var(--muted)">No products found</td></tr>`;
    return;
  }
  tbody.innerHTML = prods.map(p => {
    const stkCls   = p.stock === 0 ? 'out' : p.stock < 10 ? 'low' : 'in';
    const stkLbl   = p.stock === 0 ? 'Out of Stock' : p.stock < 10 ? `Low (${p.stock})` : p.stock;
    const url      = imgUrl(p.image);
    const catEmoji = p.category === 'oil' ? '🫙' : p.category === 'rice' ? '🌾' : p.category === 'clothes' ? '👗' : '📦';
    return `
    <tr>
      <td><div class="prod-img-cell">
        ${url
          ? `<img src="${url}" alt="${p.name}" onerror="this.style.display='none';this.parentNode.innerHTML='<span style=font-size:2rem>${catEmoji}</span>'"/>`
          : `<span style="font-size:2rem">${catEmoji}</span>`}
      </div></td>
      <td><strong>${p.name}</strong></td>
      <td><span class="cat-badge ${p.category}">${p.category}</span></td>
      <td><strong>₹${p.price.toLocaleString('en-IN')}</strong><br/><span style="font-size:.72rem;color:var(--muted)">${p.unit}</span></td>
      <td><span class="stock-chip ${stkCls}">${stkLbl}</span></td>
      <td><span class="status-pill ${p.isActive ? 'delivered' : 'cancelled'}">${p.isActive ? 'Active' : 'Hidden'}</span></td>
      <td><div class="td-actions">
        <button class="action-btn edit"   onclick="editProduct('${p._id}')">✏️ Edit</button>
        <button class="action-btn toggle" onclick="toggleProduct('${p._id}',${!p.isActive})">${p.isActive ? '🙈 Hide' : '👁 Show'}</button>
        <button class="action-btn del"    onclick="confirmDeleteProduct('${p._id}','${p.name.replace(/'/g, "\\'")}')">🗑 Del</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ── PRODUCT CRUD ──────────────────────────────────────────────
async function saveProduct() {
  const name  = document.getElementById('p-name').value.trim();
  const cat   = document.getElementById('p-cat').value;
  const price = document.getElementById('p-price').value;
  const unit  = document.getElementById('p-unit').value.trim();
  const stock = document.getElementById('p-stock').value;
  const desc  = document.getElementById('p-desc').value.trim();
  const file  = document.getElementById('p-image').files[0];
  if (!name || !price) { showToast('⚠️', 'Name and price are required'); return; }
  const fd = new FormData();
  fd.append('name', name);
  fd.append('category', cat);
  fd.append('price', price);
  fd.append('unit', unit || (cat === 'oil' ? 'per litre' : 'per piece'));
  fd.append('stock', stock || 0);
  fd.append('description', desc);
  if (file) fd.append('image', file);
  try {
    const url    = editingProductId ? `${API}/products/${editingProductId}` : `${API}/products`;
    const method = editingProductId ? 'PUT' : 'POST';
    const res    = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` }, body: fd });
    const data   = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast('✅', editingProductId ? 'Product updated!' : 'Product added!');
    clearProductForm(); loadAdminProducts();
  } catch(err) { showToast('❌', err.message); }
}

function editProduct(id) {
  const p = allProducts.find(x => x._id === id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('p-name').value  = p.name;
  document.getElementById('p-cat').value   = p.category;
  document.getElementById('p-price').value = p.price;
  document.getElementById('p-unit').value  = p.unit;
  document.getElementById('p-stock').value = p.stock;
  document.getElementById('p-desc').value  = p.description || '';
  document.getElementById('form-heading').textContent = '✏️ Edit Product';
  const url = imgUrl(p.image);
  if (url) {
    document.getElementById('img-preview').src = url;
    document.getElementById('img-preview-wrap').style.display = 'block';
  }
  document.getElementById('p-image').onchange = function() {
    const f = this.files[0];
    if (f) {
      const r = new FileReader();
      r.onload = e => {
        document.getElementById('img-preview').src = e.target.result;
        document.getElementById('img-preview-wrap').style.display = 'block';
      };
      r.readAsDataURL(f);
    }
  };
  document.getElementById('product-form-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

async function toggleProduct(id, active) {
  const fd = new FormData(); fd.append('isActive', active);
  const res  = await fetch(`${API}/products/${id}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` }, body: fd });
  const data = await res.json();
  if (data.success) { showToast('✅', active ? 'Product visible' : 'Product hidden'); loadAdminProducts(); }
}

function confirmDeleteProduct(id, name) {
  showConfirm(`Delete "${name}"?`, 'This will permanently remove the product.', async () => {
    try {
      const res  = await fetch(`${API}/products/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      showToast('🗑', 'Product deleted'); loadAdminProducts();
    } catch(err) { showToast('❌', err.message); }
  });
}

function clearProductForm() {
  ['p-name', 'p-price', 'p-unit', 'p-stock', 'p-desc'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('p-cat').value = 'oil';
  document.getElementById('p-image').value = '';
  document.getElementById('p-image').onchange = null;
  document.getElementById('img-preview-wrap').style.display = 'none';
  document.getElementById('form-heading').textContent = '➕ Add New Product';
  editingProductId = null;
}

// ── ORDERS ────────────────────────────────────────────────────
async function loadOrders() {
  const status = document.getElementById('order-status-filter')?.value || '';
  try {
    const res  = await fetch(`${API}/orders?${status ? 'status=' + status : ''}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const div = document.getElementById('orders-list');
    div.innerHTML = data.orders.length
      ? `<div class="orders-list">${data.orders.map(o => orderCardHTML(o, true)).join('')}</div>`
      : `<div class="empty-state"><div class="big-icon">📋</div><h3>No orders found</h3></div>`;
  } catch(err) { showToast('❌', err.message); }
}

function orderCardHTML(o, isAdmin = false) {
  const catEmoji = cat => cat === 'oil' ? '🫙' : cat === 'rice' ? '🌾' : '👗';
  return `
  <div class="order-card">
    <div class="order-card-top">
      <div>
        <div class="order-id-lbl">${o.orderId}</div>
        <div class="order-date-lbl">📅 ${new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</div>
      </div>
      <span class="status-pill ${o.status}">${o.status}</span>
    </div>
    <div class="order-customer-row">
      <span>👤 <strong>${o.customer.name}</strong></span>
      <span>📞 <strong>${o.customer.phone}</strong></span>
      <span>💳 <strong>${o.paymentMethod === 'cod' ? 'Cash on Delivery' : o.paymentMethod.toUpperCase()}</strong></span>
    </div>
    <div style="font-size:.82rem;color:var(--muted);margin-bottom:.75rem">📍 ${o.customer.address}</div>
    <div class="order-items-wrap">${o.items.map(i => `<span class="order-item-chip">${catEmoji(i.category)} ${i.name} ×${i.quantity}</span>`).join('')}</div>
    ${o.customer.notes ? `<div style="font-size:.8rem;color:var(--muted);margin-bottom:.75rem">📝 ${o.customer.notes}</div>` : ''}
    <div class="order-card-foot">
      <div class="order-total-lbl">₹${o.totalAmount.toLocaleString('en-IN')}</div>
      ${isAdmin ? `
      <select class="status-select-admin" onchange="updateOrderStatus('${o._id}', this.value)">
        <option value="new"        ${o.status === 'new'        ? 'selected' : ''}>🆕 New</option>
        <option value="confirmed"  ${o.status === 'confirmed'  ? 'selected' : ''}>✅ Confirmed</option>
        <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>⚙️ Processing</option>
        <option value="ready"      ${o.status === 'ready'      ? 'selected' : ''}>📦 Ready</option>
        <option value="delivered"  ${o.status === 'delivered'  ? 'selected' : ''}>🚚 Delivered</option>
        <option value="cancelled"  ${o.status === 'cancelled'  ? 'selected' : ''}>❌ Cancelled</option>
      </select>` : ''}
    </div>
  </div>`;
}

async function updateOrderStatus(id, status) {
  try {
    const res  = await fetch(`${API}/orders/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    showToast('✅', `Status → ${status}`);
  } catch(err) { showToast('❌', err.message); }
}

// ── CONFIRM MODAL ─────────────────────────────────────────────
function showConfirm(title, msg, onOk) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-msg').textContent   = msg;
  document.getElementById('confirm-ok').onclick = () => { onOk(); closeConfirm(); };
  document.getElementById('confirm-overlay').classList.add('open');
}
function closeConfirm() { document.getElementById('confirm-overlay').classList.remove('open'); }

// ── TOAST ─────────────────────────────────────────────────────
let toastTimer;
function showToast(icon, msg) {
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent  = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 3500);
}
