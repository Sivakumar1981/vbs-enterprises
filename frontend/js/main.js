/* ── VBS Enterprises ── */
const API = '/api';
let products = [];
let cart = JSON.parse(localStorage.getItem('vbs_cart') || '[]');
let customerToken = localStorage.getItem('vbs_ctoken') || null;
let customerData  = JSON.parse(localStorage.getItem('vbs_cdata') || 'null');

/* ══ AUTH ══════════════════════════════════════════════════════ */
function openAuth(mode) {
  mode = mode || 'login';
  document.getElementById('form-login').style.display    = mode === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('auth-overlay').classList.add('open');
}
function closeAuth() { document.getElementById('auth-overlay').classList.remove('open'); }
function switchAuth(mode) {
  document.getElementById('form-login').style.display    = mode === 'login'    ? 'block' : 'none';
  document.getElementById('form-register').style.display = mode === 'register' ? 'block' : 'none';
  document.getElementById('li-err').style.display = 'none';
  document.getElementById('rg-err').style.display = 'none';
}
document.getElementById('auth-overlay').addEventListener('click', function(e) { if (e.target === this) closeAuth(); });

async function doLogin() {
  var email = document.getElementById('li-email').value.trim();
  var pass  = document.getElementById('li-pass').value;
  var err   = document.getElementById('li-err');
  var btn   = document.getElementById('li-btn');
  if (!email || !pass) { showErr(err,'Enter phone/email and password'); return; }
  btn.textContent = 'Logging in...'; btn.disabled = true;
  try {
    var isPhone = /^\d{7,15}$/.test(email.replace(/[\s+\-]/g,''));
    var body    = isPhone ? {phone:email,password:pass} : {email:email,password:pass};
    var res  = await fetch(API+'/auth/customer/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    var data = await res.json();
    if (!data.success) throw new Error(data.message);
    customerToken = data.token; customerData = data.customer;
    localStorage.setItem('vbs_ctoken',data.token);
    localStorage.setItem('vbs_cdata',JSON.stringify(data.customer));
    closeAuth(); renderHeader();
    showToast('👋','Welcome, '+data.customer.name+'!');
  } catch(e) { showErr(err,e.message); }
  finally { btn.textContent='Login to Shop'; btn.disabled=false; }
}

async function doRegister() {
  var name  = document.getElementById('rg-name').value.trim();
  var phone = document.getElementById('rg-phone').value.trim();
  var email = document.getElementById('rg-email').value.trim();
  var pass  = document.getElementById('rg-pass').value;
  var addr  = document.getElementById('rg-addr').value.trim();
  var err   = document.getElementById('rg-err');
  var btn   = document.getElementById('rg-btn');
  if (!name||!phone||!pass) { showErr(err,'Name, phone and password are required'); return; }
  if (pass.length<6) { showErr(err,'Password must be at least 6 characters'); return; }
  btn.textContent='Creating...'; btn.disabled=true;
  try {
    var res  = await fetch(API+'/auth/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,phone,email,password:pass,address:addr})});
    var data = await res.json();
    if (!data.success) throw new Error(data.message);
    customerToken=data.token; customerData=data.customer;
    localStorage.setItem('vbs_ctoken',data.token);
    localStorage.setItem('vbs_cdata',JSON.stringify(data.customer));
    closeAuth(); renderHeader();
    showToast('🎉','Welcome, '+data.customer.name+'!');
  } catch(e) { showErr(err,e.message); }
  finally { btn.textContent='Create My Account'; btn.disabled=false; }
}

function showErr(el,msg){ el.textContent=msg; el.style.display='block'; }

function logout() {
  customerToken=null; customerData=null;
  localStorage.removeItem('vbs_ctoken'); localStorage.removeItem('vbs_cdata');
  cart=[]; localStorage.removeItem('vbs_cart');
  renderHeader(); updateBadge(); showPage('shop');
  showToast('👋','Logged out. See you soon!');
}

function renderHeader() {
  var pill = document.getElementById('user-pill');
  if (customerToken && customerData) {
    var first = customerData.name ? customerData.name.split(' ')[0] : 'User';
    pill.innerHTML = '<span class="user-name">👤 '+first+'</span><button onclick="logout()">Logout</button>';
  } else {
    pill.innerHTML = '<button onclick="openAuth(\'login\')">Login / Sign Up</button>';
  }
}

/* ══ NAVIGATION ════════════════════════════════════════════════ */
function showPage(name) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('active'));
  document.getElementById('page-'+name).classList.add('active');
  var btn=document.querySelector('[data-page="'+name+'"]');
  if(btn) btn.classList.add('active');
  document.getElementById('hero-wrap').style.display = name==='shop'?'block':'none';
  if(name==='cart')   renderCart();
  if(name==='orders') loadMyOrders();
  if(name==='shop')   loadProducts();
  window.scrollTo({top:0,behavior:'smooth'});
  document.getElementById('mob-nav').classList.remove('open');
}
document.querySelectorAll('[data-page]').forEach(btn=>{
  btn.addEventListener('click',()=>{
    var pg=btn.dataset.page;
    if((pg==='orders'||pg==='cart')&&!customerToken){openAuth('login');return;}
    showPage(pg);
  });
});
document.getElementById('ham').addEventListener('click',()=>document.getElementById('mob-nav').classList.toggle('open'));

/* ══ PRODUCTS ══════════════════════════════════════════════════ */
function imgUrl(image){
  if(!image) return null;
  if(image.startsWith('http')) return image;
  return '/uploads/'+image;
}

async function loadProducts() {
  var search=(document.getElementById('srch')||{value:''}).value||'';
  var cat   =(document.getElementById('cat-sel')||{value:''}).value||'';
  var sort  =(document.getElementById('sort-sel')||{value:''}).value||'';
  var grid  =document.getElementById('prod-grid');
  grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">⏳</div><h3>Loading...</h3></div>';
  try {
    var url=API+'/products?';
    if(search) url+='search='+encodeURIComponent(search)+'&';
    if(cat)    url+='category='+encodeURIComponent(cat)+'&';
    var res  = await fetch(url);
    var text = await res.text();
    var data;
    try { data=JSON.parse(text); }
    catch(e){ throw new Error('API returned HTML. server.js routing issue — contact support.'); }
    if(!data.success) throw new Error(data.message||'Failed');
    products=data.products||[];
    if(sort==='asc')  products.sort((a,b)=>a.price-b.price);
    if(sort==='desc') products.sort((a,b)=>b.price-a.price);
    renderProds();
  } catch(err) {
    grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">⚠️</div><h3>Could not load products</h3><p>'+err.message+'</p></div>';
  }
}

function filterCat(cat) {
  var sel=document.getElementById('cat-sel');
  if(sel) sel.value=cat;
  document.querySelectorAll('.hcat-btn').forEach(b=>b.classList.remove('active-cat'));
  if(event&&event.target) event.target.classList.add('active-cat');
  showPage('shop');
}

const catIcon ={saree:'👘',nighty:'🌙',chudidhar:'👗',blouse:'🪡',oil:'🫙',rice:'🌾',other:'📦'};
const catLabel={saree:'Saree',nighty:'Nighty',chudidhar:'Chudidhar',blouse:'Blouse',oil:'Oil',rice:'Rice',other:'Other'};

function renderProds(){
  var grid=document.getElementById('prod-grid');
  if(!products.length){grid.innerHTML='<div class="empty" style="grid-column:1/-1"><div class="ei">🔍</div><h3>No products found</h3></div>';return;}
  grid.innerHTML=products.map(p=>{
    var inCart=cart.find(c=>c._id===p._id);
    var stkCls=p.stock===0?'out':p.stock<10?'low':'in';
    var stkLbl=p.stock===0?'Out of Stock':p.stock<10?'Only '+p.stock+' left':'In Stock';
    var img=imgUrl(p.image);
    var icon=catIcon[p.category]||'📦';
    var lbl =catLabel[p.category]||'Other';
    return '<div class="prod-card">'
      +'<div class="prod-img">'
      +(img?'<img src="'+img+'" alt="'+p.name+'" loading="lazy"/>'
           :'<div class="no-img">'+icon+'</div>')
      +'<span class="cat-tag">'+icon+' '+lbl+'</span>'
      +'<span class="stk-tag '+stkCls+'">'+stkLbl+'</span>'
      +'</div><div class="prod-body">'
      +'<div class="prod-name">'+p.name+'</div>'
      +'<div class="prod-desc">'+(p.description||'Premium quality from VBS Enterprises.')+'</div>'
      +'<div class="prod-price">₹'+p.price.toLocaleString('en-IN')+' <span class="prod-unit">'+(p.unit||'')+'</span></div>'
      +'<div class="prod-actions">'
      +'<button class="btn-add" onclick="addToCart(\''+p._id+'\')" '+(p.stock===0?'disabled':'')+'>'
      +(inCart?'✓ In Cart ('+inCart.qty+')':'+ Add to Cart')
      +'</button>'
      +'<button class="btn-eye" onclick="quickView(\''+p._id+'\')">👁</button>'
      +'</div></div></div>';
  }).join('');
}

function quickView(id){
  var p=products.find(x=>x._id===id); if(!p) return;
  var inCart=cart.find(c=>c._id===id);
  var img=imgUrl(p.image);
  var stkCls=p.stock===0?'out':p.stock<10?'low':'in';
  var stkLbl=p.stock===0?'Out of Stock':p.stock<10?'Only '+p.stock+' left':'In Stock ('+p.stock+')';
  var icon=catIcon[p.category]||'📦'; var lbl=catLabel[p.category]||'Other';
  document.getElementById('success-box').innerHTML=
    '<button class="modal-close" onclick="closeSuccess()">✕</button>'
    +'<div style="border-radius:12px;overflow:hidden;height:200px;background:var(--cream);display:flex;align-items:center;justify-content:center;margin-bottom:1rem">'
    +(img?'<img src="'+img+'" style="width:100%;height:100%;object-fit:cover"/>'
         :'<div style="font-size:5rem">'+icon+'</div>')
    +'</div>'
    +'<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:1.6rem;color:var(--deep);margin-bottom:.5rem">'+p.name+'</h3>'
    +'<p style="color:var(--muted);font-size:.88rem;line-height:1.6;margin-bottom:1rem">'+(p.description||'Premium quality from VBS Enterprises.')+'</p>'
    +'<div style="display:flex;justify-content:space-between;align-items:center;background:var(--warm);padding:.9rem 1rem;border-radius:10px;margin-bottom:1rem">'
    +'<div class="prod-price" style="font-size:1.5rem">₹'+p.price.toLocaleString('en-IN')+'<span class="prod-unit"> '+(p.unit||'')+'</span></div>'
    +'<span class="stk-tag '+stkCls+'" style="position:static">'+stkLbl+'</span>'
    +'</div>'
    +'<button class="btn-add" style="width:100%;padding:.8rem" onclick="addToCart(\''+p._id+'\');closeSuccess()" '+(p.stock===0?'disabled':'')+'>'
    +(inCart?'✓ Already in Cart ('+inCart.qty+')':'+ Add to Cart')
    +'</button>';
  document.getElementById('success-overlay').classList.add('open');
}

/* ══ CART ══════════════════════════════════════════════════════ */
function addToCart(id){
  if(!customerToken){openAuth('login');return;}
  var p=products.find(x=>x._id===id);
  if(!p||p.stock===0) return;
  var ex=cart.find(c=>c._id===id);
  if(ex){if(ex.qty<p.stock)ex.qty++;else{showToast('⚠️','Max stock: '+p.stock);return;}}
  else cart.push({_id:p._id,name:p.name,price:p.price,qty:1,image:p.image,category:p.category,unit:p.unit||''});
  saveCart(); renderProds(); showToast('🛒',p.name+' added!');
}
function removeItem(id){cart=cart.filter(c=>c._id!==id);saveCart();renderCart();renderProds();}
function changeQty(id,d){
  var item=cart.find(c=>c._id===id);
  var prod=products.find(p=>p._id===id);
  if(!item) return;
  item.qty=Math.max(1,Math.min(prod?prod.stock:99,item.qty+d));
  saveCart();renderCart();
}
function saveCart(){localStorage.setItem('vbs_cart',JSON.stringify(cart));updateBadge();}
function updateBadge(){
  var n=cart.reduce((s,i)=>s+i.qty,0);
  document.getElementById('cbadge').textContent=n;
  document.getElementById('cbadge-m').textContent=n;
}
function cartTotal(){return cart.reduce((s,i)=>s+i.price*i.qty,0);}

function renderCart(){
  var div=document.getElementById('cart-wrap');
  if(!cart.length){
    div.innerHTML='<div class="empty"><div class="ei">🛒</div><h3>Cart is empty</h3><br/><button class="btn-gold" onclick="showPage(\'shop\')" style="width:auto;padding:.6rem 1.5rem">Shop Now</button></div>';
    return;
  }
  var items=cart.map(item=>{
    var icon=catIcon[item.category]||'📦';
    return '<div class="cart-item">'
      +'<div class="ci-img">'+(item.image?'<img src="'+imgUrl(item.image)+'" alt="'+item.name+'"/>':icon)+'</div>'
      +'<div class="ci-info"><h4>'+item.name+'</h4>'
      +'<div class="ci-cat">'+icon+' '+(catLabel[item.category]||'Other')+' · '+item.unit+'</div>'
      +'<div class="qty-row"><button class="qbtn" onclick="changeQty(\''+item._id+'\',-1)">−</button><span class="qnum">'+item.qty+'</span><button class="qbtn" onclick="changeQty(\''+item._id+'\',1)">+</button></div>'
      +'</div>'
      +'<div class="ci-right"><div class="ci-price">₹'+(item.price*item.qty).toLocaleString('en-IN')+'</div>'
      +'<button class="btn-rm" onclick="removeItem(\''+item._id+'\')">🗑</button></div></div>';
  }).join('');
  var sumRows=cart.map(i=>'<div class="sum-row"><span>'+i.name+' ×'+i.qty+'</span><span>₹'+(i.price*i.qty).toLocaleString('en-IN')+'</span></div>').join('');
  var total=cartTotal().toLocaleString('en-IN');
  var addr=customerData&&customerData.address?customerData.address:'';
  div.innerHTML='<div class="cart-grid">'
    +'<div>'+items+'</div>'
    +'<div class="o-summary"><h3>Order Summary</h3>'+sumRows
    +'<div class="sum-row tot"><span>Total</span><span>₹'+total+'</span></div>'
    +'<div class="chk-form">'
    +'<h4 style="color:var(--gold);margin:.5rem 0 .25rem">Delivery Details</h4>'
    +'<label>Delivery Address *</label>'
    +'<textarea id="c-addr" rows="3" placeholder="Full delivery address...">'+addr+'</textarea>'
    +'<label>Payment Method</label>'
    +'<select id="c-pay"><option value="cod">Cash on Delivery</option><option value="upi">UPI</option><option value="bank">Bank Transfer</option></select>'
    +'<label>Notes (optional)</label>'
    +'<textarea id="c-notes" rows="2" placeholder="Any special requests..."></textarea>'
    +'<button class="btn-place" id="place-btn" onclick="placeOrder()">🛍️ Place Order — ₹'+total+'</button>'
    +'</div></div></div>';
}

/* ══ PLACE ORDER ═══════════════════════════════════════════════ */
async function placeOrder(){
  if(!customerToken){openAuth('login');return;}
  var addr =(document.getElementById('c-addr')||{value:''}).value.trim();
  var pay  =(document.getElementById('c-pay')||{value:'cod'}).value;
  var notes=(document.getElementById('c-notes')||{value:''}).value.trim();
  if(!addr){showToast('⚠️','Please enter delivery address');return;}
  if(!customerData||!customerData.name){
    try{
      var vr=await fetch(API+'/auth/verify',{headers:{Authorization:'Bearer '+customerToken}});
      var vd=await vr.json();
      if(vd.success&&vd.customer){customerData=vd.customer;localStorage.setItem('vbs_cdata',JSON.stringify(vd.customer));}
    }catch(e){}
  }
  var btn=document.getElementById('place-btn');
  if(btn){btn.disabled=true;btn.textContent='Placing order...';}
  try{
    var res=await fetch(API+'/orders',{
      method:'POST',
      headers:{'Content-Type':'application/json',Authorization:'Bearer '+customerToken},
      body:JSON.stringify({
        items:cart.map(i=>({productId:i._id,quantity:i.qty})),
        paymentMethod:pay,notes,deliveryAddress:addr,
        customer:{name:(customerData&&customerData.name)||'Customer',phone:(customerData&&customerData.phone)||'',address:addr}
      })
    });
    var data=await res.json();
    if(!data.success) throw new Error(data.message);
    cart=[];saveCart();
    var o=data.order;
    document.getElementById('success-box').innerHTML=
      '<div style="text-align:center">'
      +'<div style="font-size:3rem;margin-bottom:.75rem">🎉</div>'
      +'<h3 style="font-family:\'Cormorant Garamond\',serif;font-size:1.6rem;color:var(--deep);margin-bottom:.5rem">Order Placed!</h3>'
      +'<p style="color:var(--muted);font-size:.88rem">Thank you <strong>'+(o.customer&&o.customer.name||'')+'</strong>! We will contact you soon.</p>'
      +'<div class="o-box" style="margin-top:1rem;text-align:left">'
      +'<p><strong>Order ID:</strong> '+o.orderId+'</p>'
      +o.items.map(i=>'<p>• '+i.name+' ×'+i.quantity+' — ₹'+(i.price*i.quantity).toLocaleString('en-IN')+'</p>').join('')
      +'<p style="margin-top:.5rem"><strong>Total: ₹'+o.totalAmount.toLocaleString('en-IN')+'</strong></p>'
      +'<p><strong>Payment:</strong> '+(pay==='cod'?'Cash on Delivery':pay.toUpperCase())+'</p>'
      +'</div>'
      +'<div style="display:flex;gap:.75rem;justify-content:center;margin-top:1.25rem;flex-wrap:wrap">'
      +'<button class="btn-gold" style="width:auto;padding:.6rem 1.25rem" onclick="closeSuccess();showPage(\'shop\')">Continue Shopping</button>'
      +'<button class="btn-outline" onclick="closeSuccess();showPage(\'orders\')">My Orders</button>'
      +'</div></div>';
    document.getElementById('success-overlay').classList.add('open');
  }catch(err){
    showToast('❌',err.message);
    if(btn){btn.disabled=false;btn.textContent='🛍️ Place Order — ₹'+cartTotal().toLocaleString('en-IN');}
  }
}

/* ══ MY ORDERS ═════════════════════════════════════════════════ */
async function loadMyOrders(){
  var div=document.getElementById('orders-wrap');
  if(!customerToken){
    div.innerHTML='<div class="empty"><div class="ei">🔒</div><h3>Login to view orders</h3><br/><button class="btn-gold" style="width:auto;padding:.6rem 1.25rem" onclick="openAuth(\'login\')">Login</button></div>';
    return;
  }
  div.innerHTML='<div class="empty"><div class="ei">⏳</div><h3>Loading orders...</h3></div>';
  try{
    var res=await fetch(API+'/orders/my',{headers:{Authorization:'Bearer '+customerToken}});
    var data=await res.json();
    if(!data.success) throw new Error(data.message);
    if(!data.orders.length){
      div.innerHTML='<div class="empty"><div class="ei">📦</div><h3>No orders yet</h3><br/><button class="btn-gold" style="width:auto;padding:.6rem 1.25rem" onclick="showPage(\'shop\')">Shop Now</button></div>';
      return;
    }
    div.innerHTML='<div class="orders-list">'+data.orders.map(o=>
      '<div class="ord-card">'
      +'<div class="ord-top"><div><div class="ord-id">'+o.orderId+'</div>'
      +'<div class="ord-date">📅 '+new Date(o.createdAt).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})+'</div></div>'
      +'<span class="spill '+o.status+'">'+o.status+'</span></div>'
      +'<div class="ord-items">'+o.items.map(i=>'<span class="ord-chip">'+(catIcon[i.category]||'📦')+' '+i.name+' ×'+i.quantity+'</span>').join('')+'</div>'
      +'<div class="ord-foot"><div class="ord-total">₹'+o.totalAmount.toLocaleString('en-IN')+'</div>'
      +'<span style="font-size:.8rem;color:var(--muted)">'+(o.paymentMethod==='cod'?'Cash on Delivery':o.paymentMethod.toUpperCase())+'</span></div>'
      +'</div>'
    ).join('')+'</div>';
  }catch(err){div.innerHTML='<div class="empty"><div class="ei">⚠️</div><h3>'+err.message+'</h3></div>';}
}

/* ══ MODAL & TOAST ═════════════════════════════════════════════ */
function closeSuccess(){document.getElementById('success-overlay').classList.remove('open');}
document.getElementById('success-overlay').addEventListener('click',function(e){if(e.target===this)closeSuccess();});

var _tt;
function showToast(icon,msg){
  document.getElementById('toast-icon').textContent=icon;
  document.getElementById('toast-msg').textContent=msg;
  var t=document.getElementById('toast');
  t.classList.add('show');
  clearTimeout(_tt);
  _tt=setTimeout(()=>t.classList.remove('show'),3500);
}

/* ══ INIT ══════════════════════════════════════════════════════ */
renderHeader();
updateBadge();
loadProducts();
