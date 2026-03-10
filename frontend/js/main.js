/* ── VBS Enterprises Customer JS ── */
const API = '/api';
let products = [];
let cart = JSON.parse(localStorage.getItem('vbs_cart') || '[]');
let customerToken = localStorage.getItem('vbs_ctoken');
let customerData  = JSON.parse(localStorage.getItem('vbs_cdata') || 'null');

/* ══════════════ AUTH ══════════════════════════════════════ */
function openAuth(mode = 'login') {
  switchAuth(mode);
  document.getElementById('auth-overlay').classList.add('open');
}
function closeAuth() {
  document.getElementById('auth-overlay').classList.remove('open');
  clearAuthErrors();
}
function switchAuth(mode) {
  document.getElementById('form-login').style.display    = mode === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
}
function clearAuthErrors() {
  document.getElementById('li-err').classList.remove('show');
  document.getElementById('rg-err').classList.remove('show');
}
document.getElementById('auth-overlay').addEventListener('click', e => {
  if (e.target === e.currentTarget) closeAuth();
});

async function doLogin() {
    const phoneOrEmail = document.getElementById('li-email').value.trim();
  const pass  = document.getElementById('li-pass').value;
  const err   = document.getElementById('li-err');
  const btn   = document.getElementById('li-btn');
  if (!phoneOrEmail || !pass) { showAuthErr(err, 'Enter phone/email and password'); return; }
  btn.textContent = 'Logging in...'; btn.disabled = true;
  try {
    const res  = await fetch(`${API}/auth/customer/login`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: phoneOrEmail.includes('@') ? undefined : phoneOrEmail, email: phoneOrEmail.includes('@') ? phoneOrEmail : undefined, password: pass }) });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    saveSession(data.token, data.customer);
    closeAuth();
    renderHeader();
    showToast('👋', `Welcome, ${data.customer.name}!`);
    loadProducts();
  } catch (e) { showAuthErr(err, e.message); }
  finally { btn.textContent = 'Login to Shop'; btn.disabled = false; }
}

async function doRegister() {
  const name  = document.getElementById('rg-name').value.trim();
  const phone = document.getElementById('rg-phone').value.trim();
  const email = document.getElementById('rg-email').value.trim();
  const pass  = document.getElementById('rg-pass').value;
  const addr  = document.getElementById('rg-addr').value.trim();
  const err   = document.getElementById('rg-err');
  const btn   = document.getElementById('rg-btn');
  if (!name || !phone || !pass) { showAuthErr(err, 'Name, phone and password are required'); return; }
  if (pass.length < 6) { showAuthErr(err, 'Password must be at least 6 characters'); return; }
  btn.textContent = 'Creating account...'; btn.disabled = true;
  try {
    const res  = await fetch(`${API}/auth/register`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name, phone, email, password: pass, address: addr }) });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    saveSession(data.token, data.customer);
    closeAuth();
    renderHeader();
    showToast('🎉', `Account created! Welcome, ${data.customer.name}!`);
    loadProducts();
  } catch (e) { showAuthErr(err, e.message); }
  finally { btn.textContent = 'Create My Account'; btn.disabled = false; }
}

function showAuthErr(el, msg) { el.textContent = msg; el.classList.add('show'); }
function saveSession(token, cust) {
  customerToken = token; customerData = cust;
  localStorage.setItem('vbs_ctoken', token);
  localStorage.setItem('vbs_cdata', JSON.stringify(cust));
}
function logout() {
  customerToken = null; customerData = null;
  localStorage.removeItem('vbs_ctoken');
  localStorage.removeItem('vbs_cdata');
  cart = []; saveCart();
  renderHeader();
  showPage('shop');
  showToast('👋', 'Logged out. See you soon!');
}
function handleUserBtn() {
  if (!customerToken) openAuth('login');
  else logout();
}

function renderHeader() {
  const pill = document.getElementById('user-pill');
  if (customerToken && customerData) {
    pill.innerHTML = `<span class="user-name">👤 ${customerData.name.split(' ')[0]}</span><button onclick="logout()">Logout</button>`;
  } else {
    pill.innerHTML = `<button onclick="openAuth('login')">Login / Sign Up</button>`;
  }
}

/* ══════════════ NAVIGATION ════════════════════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  document.querySelector(`[data-page="${name}"]`)?.classList.add('active');
  document.getElementById('hero-wrap').style.display = name === 'shop' ? 'block' : 'none';
  if (name === 'cart')   renderCart();
  if (name === 'orders') loadMyOrders();
  if (name === 'shop')   loadProducts();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  document.getElementById('mob-nav').classList.remove('open');
}

document.querySelectorAll('[data-page]').forEach(btn => {
  btn.addEventListener('click', () => {
    if ((btn.dataset.page === 'orders' || btn.dataset.page === 'cart') && !customerToken) {
      openAuth('login'); return;
    }
    showPage(btn.dataset.page);
  });
});
document.getElementById('ham').addEventListener('click', () => {
  document.getElementById('mob-nav').classList.toggle('open');
});

/* ══════════════ PRODUCTS ══════════════════════════════════ */
async function loadProducts() {
  const search = document.getElementById('srch')?.value || '';
  const cat    = document.getElementById('cat-sel')?.value || '';
  const sort   = document.getElementById('sort-sel')?.value || '';
  try {
    let url = `${API}/products?`;
    if (search) url += `search=${encodeURIComponent(search)}&`;
    if (cat)    url += `category=${cat}&`;
    const res  = await fetch(url);
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    products = data.products;
    if (sort === 'asc')  products.sort((a, b) => a.price - b.price);
    if (sort === 'desc') products.sort((a, b) => b.price - a.price);
    renderProds();
  } catch (err) {
    document.getElementById('prod-grid').innerHTML =
      `<div class="empty" style="grid-column:1/-1"><div class="ei">⚠️</div><h3>Could not load products</h3><p>${err.message}</p></div>`;
  }
}

function filterCat(cat) {
  document.getElementById('cat-sel').value = cat;
  document.querySelectorAll('.hcat-btn').forEach(b => b.classList.remove('active-cat'));
  event.target.classList.add('active-cat');
  showPage('shop');
  loadProducts();
}

const catIcon  = { clothes: '👗', oil: '🫙', rice: '🌾', other: '📦' };
const catLabel = { clothes: 'Clothes', oil: 'Oil', rice: 'Rice', other: 'Other' };

function imgUrl(image) {
  if (!image) return null;
  if (image.startsWith('http')) return image;
  return '/uploads/' + image;
}

function renderProds() {
  const grid = document.getElementById('prod-grid');
  if (!products.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="ei">🔍</div><h3>No products found</h3><p>Try a different search or category.</p></div>`;
    return;
  }
  grid.innerHTML = products.map(p => {
    const inCart = cart.find(c => c._id === p._id);
    const stkCls = p.stock === 0 ? 'out' : p.stock < 10 ? 'low' : 'in';
    const stkLbl = p.stock === 0 ? 'Out of Stock' : p.stock < 10 ? `Only ${p.stock} left` : 'In Stock';
    const url    = imgUrl(p.image);
    return `
    <div class="prod-card">
      <div class="prod-img">
        ${url ? `<img src="${url}" alt="${p.name}" loading="lazy"/>` : `<div class="no-img">${catIcon[p.category] || '📦'}</div>`}
        <span class="cat-tag ${p.category}">${catIcon[p.category] || '📦'} ${catLabel[p.category] || 'Other'}</span>
        <span class="stk-tag ${stkCls}">${stkLbl}</span>
      </div>
      <div class="prod-body">
        <div class="prod-name">${p.name}</div>
        <div class="prod-desc">${p.description || 'Premium quality product from VBS Enterprises.'}</div>
        <div class="prod-foot">
          <div class="prod-price">₹${p.price.toLocaleString('en-IN')} <span class="prod-unit">${p.unit || ''}</span></div>
        </div>
        <div class="prod-actions">
          <button class="btn-add" onclick="addToCart('${p._id}')" ${p.stock === 0 ? 'disabled' : ''}>
            ${inCart ? `✓ In Cart (${inCart.qty})` : '+ Add to Cart'}
          </button>
          <button class="btn-eye" onclick="quickView('${p._id}')">👁</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function quickView(id) {
  const p = products.find(x => x._id === id);
  if (!p) return;
  const inCart = cart.find(c => c._id === id);
  const url    = imgUrl(p.image);
  const stkCls = p.stock === 0 ? 'out' : p.stock < 10 ? 'low' : 'in';
  const stkLbl = p.stock === 0 ? 'Out of Stock' : p.stock < 10 ? `Only ${p.stock} left` : `In Stock (${p.stock})`;
  document.getElementById('success-box').innerHTML = `
    <button class="modal-close" onclick="closeSuccess()">✕</button>
    <div style="border-radius:12px;overflow:hidden;height:200px;background:var(--warm);display:flex;align-items:center;justify-content:center;margin-bottom:1rem">
      ${url ? `<img src="${url}" style="width:100%;height:100%;object-fit:cover"/>` : `<div style="font-size:5rem">${catIcon[p.category]||'📦'}</div>`}
    </div>
    <span class="cat-tag ${p.category}" style="position:static;display:inline-block;margin-bottom:.75rem">${catLabel[p.category]||'Other'}</span>
    <h3 style="font-family:'Cormorant Garamond',serif;font-size:1.6rem;color:var(--deep);margin-bottom:.5rem">${p.name}</h3>
    <p style="color:var(--muted);font-size:.88rem;line-height:1.6;margin-bottom:1rem">${p.description||'Premium quality from VBS Enterprises.'}</p>
    <div style="display:flex;justify-content:space-between;align-items:center;background:var(--warm);padding:.9rem 1rem;border-radius:10px;margin-bottom:1rem">
      <div class="prod-price" style="font-size:1.5rem">₹${p.price.toLocaleString('en-IN')}<span class="prod-unit" style="font-size:.8rem"> ${p.unit}</span></div>
      <span class="stk-tag ${stkCls}" style="position:static">${stkLbl}</span>
    </div>
    <button class="btn-add" style="width:100%;padding:.8rem" onclick="addToCart('${p._id}');closeSuccess()" ${p.stock===0?'disabled':''}>
      ${inCart ? `✓ Already in Cart (${inCart.qty})` : '+ Add to Cart'}
    </button>`;
  document.getElementById('success-overlay').classList.add('open');
}

/* ══════════════ CART ══════════════════════════════════════ */
function addToCart(id) {
  if (!customerToken) { openAuth('login'); return; }
  const p = products.find(x => x._id === id);
  if (!p || p.stock === 0) return;
  const ex = cart.find(c => c._id === id);
  if (ex) {
    if (ex.qty < p.stock) ex.qty++;
    else { showToast('⚠️', `Max stock: ${p.stock}`); return; }
  } else {
    cart.push({ _id: p._id, name: p.name, price: p.price, qty: 1, image: p.image, category: p.category, unit: p.unit });
  }
  saveCart();
  renderProds();
  showToast('🛒', `${p.name} added!`);
}

function removeItem(id) { cart = cart.filter(c => c._id !== id); saveCart(); renderCart(); renderProds(); }
function changeQty(id, d) {
  const item = cart.find(c => c._id === id);
  const prod = products.find(p => p._id === id);
  if (!item) return;
  item.qty = Math.max(1, Math.min(prod ? prod.stock : 99, item.qty + d));
  saveCart(); renderCart();
}
function saveCart() { localStorage.setItem('vbs_cart', JSON.stringify(cart)); updateBadge(); }
function updateBadge() {
  const n = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('cbadge').textContent   = n;
  document.getElementById('cbadge-m').textContent = n;
}
function cartTotal() { return cart.reduce((s, i) => s + i.price * i.qty, 0); }

function renderCart() {
  const div = document.getElementById('cart-wrap');
  if (!cart.length) {
    div.innerHTML = `<div class="empty"><div class="ei">🛒</div><h3>Cart is empty</h3><p>Browse products and add items.</p><br/><button class="btn-gold" onclick="showPage('shop')">Shop Now</button></div>`;
    return;
  }
  div.innerHTML = `
  <div class="cart-grid">
    <div class="cart-col">
      ${cart.map(item => {
        const url = imgUrl(item.image);
        return `
      <div class="cart-item">
        <div class="ci-img">
          ${url ? `<img src="${url}" alt="${item.name}"/>` : (catIcon[item.category] || '📦')}
        </div>
        <div class="ci-info">
          <h4>${item.name}</h4>
          <div class="ci-cat">${catIcon[item.category]||'📦'} ${catLabel[item.category]||'Other'} · ${item.unit||''}</div>
          <div class="qty-row">
            <button class="qbtn" onclick="changeQty('${item._id}',-1)">−</button>
            <span class="qnum">${item.qty}</span>
            <button class="qbtn" onclick="changeQty('${item._id}',1)">+</button>
          </div>
        </div>
        <div class="ci-right">
          <div class="ci-price">₹${(item.price*item.qty).toLocaleString('en-IN')}</div>
          <button class="btn-rm" onclick="removeItem('${item._id}')">🗑</button>
        </div>
      </div>`;}).join('')}
    </div>
    <div class="o-summary">
      <h3>Order Summary</h3>
      ${cart.map(i => `<div class="sum-row"><span>${i.name} ×${i.qty}</span><span>₹${(i.price*i.qty).toLocaleString('en-IN')}</span></div>`).join('')}
      <div class="sum-row tot"><span>Total</span><span>₹${cartTotal().toLocaleString('en-IN')}</span></div>
      <div class="chk-form">
        <h4 style="color:var(--gold-l);font-family:'Cormorant Garamond',serif;font-size:1.15rem;margin:.5rem 0 .1rem">Delivery Details</h4>
        <div><label>Delivery Address *</label><textarea id="c-addr" placeholder="Full delivery address...">${customerData?.address||''}</textarea></div>
        <div>
          <label>Payment Method</label>
          <select id="c-pay"><option value="cod">Cash on Delivery</option><option value="upi">UPI</option><option value="bank">Bank Transfer</option></select>
        </div>
        <div><label>Notes (optional)</label><textarea id="c-notes" placeholder="Any special requests..."></textarea></div>
        <button class="btn-place" id="place-btn" onclick="placeOrder()">🛍️ Place Order — ₹${cartTotal().toLocaleString('en-IN')}</button>
      </div>
    </div>
  </div>`;
}

/* ══════════════ PLACE ORDER ═══════════════════════════════ */
async function placeOrder() {
  if (!customerToken) { openAuth('login'); return; }
  const addr  = document.getElementById('c-addr')?.value.trim();
  const pay   = document.getElementById('c-pay')?.value;
  const notes = document.getElementById('c-notes')?.value.trim();
  if (!addr) { showToast('⚠️', 'Please enter delivery address'); return; }
  if (!customerData?.name || !customerData?.phone) { showToast('⚠️', 'Please login again'); return; }
  const btn = document.getElementById('place-btn');
  btn.disabled = true; btn.textContent = 'Placing order...';
  try {
    const res = await fetch(`${API}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${customerToken}` },
      body: JSON.stringify({
        customer: {
          name:    customerData.name,
          phone:   customerData.phone,
          address: addr
        },
        items: cart.map(i => ({ productId: i._id, quantity: i.qty })),
        paymentMethod: pay,
        notes
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    cart = []; saveCart();
    showOrderSuccess(data);
  } catch (err) {
    showToast('❌', err.message);
    btn.disabled = false;
    btn.textContent = `🛍️ Place Order — ₹${cartTotal().toLocaleString('en-IN')}`;
  }
}

function showOrderSuccess(data) {
  const o = data.order;
  document.getElementById('success-box').innerHTML = `
    <div class="success-box">
      <div class="success-icon">🎉</div>
      <h3>Order Placed!</h3>
      <p>Thank you <strong>${o.customer.name}</strong>! Your order is confirmed and we will contact you soon.</p>
      <div class="o-box">
        <p><strong>Order ID:</strong> ${o.orderId}</p>
        ${o.items.map(i => `<p>• ${i.name} ×${i.quantity} — ₹${(i.price*i.quantity).toLocaleString('en-IN')}</p>`).join('')}
        <p style="margin-top:.5rem"><strong>Total: ₹${o.totalAmount.toLocaleString('en-IN')}</strong></p>
        <p><strong>Payment:</strong> ${o.paymentMethod === 'cod' ? 'Cash on Delivery' : o.paymentMethod.toUpperCase()}</p>
        <p><strong>Address:</strong> ${o.customer.address}</p>
      </div>
      <p style="font-size:.8rem;color:var(--muted)">Save your Order ID: <strong>${o.orderId}</strong></p>
      <div style="display:flex;gap:.75rem;justify-content:center;margin-top:1.25rem;flex-wrap:wrap">
        <button class="btn-gold" onclick="closeSuccess();showPage('shop')">Continue Shopping</button>
        <button class="btn-outline" onclick="closeSuccess();showPage('orders')">My Orders</button>
      </div>
    </div>`;
  document.getElementById('success-overlay').classList.add('open');
}

/* ══════════════ MY ORDERS ═════════════════════════════════ */
async function loadMyOrders() {
  if (!customerToken) { document.getElementById('orders-wrap').innerHTML = `<div class="empty"><div class="ei">🔒</div><h3>Login to view orders</h3><br/><button class="btn-gold" onclick="openAuth('login')">Login</button></div>`; return; }
  try {
    const res  = await fetch(`${API}/orders/my?phone=${encodeURIComponent(customerData?.phone||'')}`, { headers: { Authorization: `Bearer ${customerToken}` } });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);
    const div = document.getElementById('orders-wrap');
    if (!data.orders.length) { div.innerHTML = `<div class="empty"><div class="ei">📦</div><h3>No orders yet</h3><br/><button class="btn-gold" onclick="showPage('shop')">Shop Now</button></div>`; return; }
    div.innerHTML = `<div class="orders-list">${data.orders.map(o => `
      <div class="ord-card">
        <div class="ord-top">
          <div><div class="ord-id">${o.orderId}</div><div class="ord-date">📅 ${new Date(o.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}</div></div>
          <span class="spill ${o.status}">${o.status}</span>
        </div>
        <div class="ord-items">${o.items.map(i => `<span class="ord-chip">${catIcon[i.category]||'📦'} ${i.name} ×${i.quantity}</span>`).join('')}</div>
        <div class="ord-foot">
          <div class="ord-total">₹${o.totalAmount.toLocaleString('en-IN')}</div>
          <span style="font-size:.8rem;color:var(--muted)">${o.paymentMethod==='cod'?'Cash on Delivery':o.paymentMethod.toUpperCase()}</span>
        </div>
      </div>`).join('')}</div>`;
  } catch (err) { showToast('❌', err.message); }
}

/* ══════════════ MODALS ════════════════════════════════════ */
function closeSuccess() { document.getElementById('success-overlay').classList.remove('open'); }
document.getElementById('success-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeSuccess(); });

/* ══════════════ TOAST ═════════════════════════════════════ */
let tt;
function showToast(icon, msg) {
  document.getElementById('toast-icon').textContent = icon;
  document.getElementById('toast-msg').textContent  = msg;
  const t = document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('show'), 3500);
}

/* ══════════════ INIT ══════════════════════════════════════ */
renderHeader();
updateBadge();
loadProducts();
