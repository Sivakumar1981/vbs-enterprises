/* ============================================================
   VBS Enterprises – Tally add-on (v2)
   Plugs into the existing Tally tab WITHOUT changing its code.
   Tabs:  Overview | Counter (Printer) Bills | Site Orders | Profit
   - Date-wise view: pick From / To dates (or Today, Yesterday, 7 days…)
     or leave them empty to follow the Year / Month selectors above.
   - Counter bills and Site orders are kept in SEPARATE lists.
   - Profit uses the same purchase prices as your "Final Report"
     (so the numbers agree); it has its own tab / column.
   ============================================================ */
(function () {
  'use strict';
  var BILLS = [], PRODS = {}, PPRAW = {}, IDX = {}, PPVER = 1, fetchedAt = 0, charts = {};
  var tab = 'ov', D = null;
  var F = { q: '', pay: '', oq: '', ost: '', profit: false };
  var shown = { c: 100, o: 100 };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var PAY = { cash: 'Cash', upi: 'UPI', card: 'Card' };
  var COL = { gold: '#c8902a', dark: '#3b2410', green: '#0a9d3f', blue: '#2a62c8', red: '#d93025', light: '#e8c068' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function iso(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function tok() { return (typeof token !== 'undefined' && token) || localStorage.getItem('vbs_atoken') || ''; }
  function api() { return typeof API !== 'undefined' ? API : '/api'; }
  function say(i, m) { try { if (typeof toast === 'function') toast(i, m); } catch (e) {} }
  function pay(b) { return b.paymentType || 'cash'; }
  function norm(s) { return String(s || '').trim().toLowerCase(); }
  function allOrders() { return (typeof allOrdersCache !== 'undefined' && allOrdersCache) ? allOrdersCache : []; }
  function get(u) { return fetch(api() + u, { headers: { Authorization: 'Bearer ' + tok() } }).then(function (r) { return r.json(); }); }
  function fmtD(d) { return p2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); }

  /* ---------- styles ---------- */
  function addStyle() {
    if ($('qbt-style')) return;
    var st = document.createElement('style'); st.id = 'qbt-style';
    st.textContent =
      '.qbt{margin:0 0 1.5rem}' +
      '.qbt-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin:0 0 .7rem}' +
      '.qbt-head h3{font-family:"Cormorant Garamond",serif;font-size:1.45rem;color:var(--deep,#1a0f00);margin:0}' +
      '.qbt-head p{font-size:.78rem;color:var(--muted,#8a7552);margin:.15rem 0 0}' +
      '.qbt-bar{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center;background:var(--card,#fff);border:1.5px solid var(--border,#e6d6b8);border-radius:13px;padding:.6rem .8rem;margin-bottom:.8rem}' +
      '.qbt-bar label{font-size:.78rem;font-weight:700;color:var(--muted,#8a7552)}' +
      '.qbt-bar input,.qbt-bar select,.qbt-tools input,.qbt-tools select{padding:.4rem .6rem;border:1.5px solid var(--border,#e6d6b8);border-radius:8px;font-size:.84rem;background:#fff}' +
      '.qbt-q{border:1.5px solid var(--border,#e6d6b8);background:#faf4e8;color:#5a4325;border-radius:999px;padding:.32rem .8rem;font-size:.78rem;font-weight:700;cursor:pointer}' +
      '.qbt-q:hover{background:#efe2c8}' +
      '.qbt-lbl{margin-left:auto;font-size:.8rem;font-weight:800;color:var(--deep,#1a0f00)}' +
      '.qbt-tabs{display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:.9rem}' +
      '.qbt-tab{border:1.5px solid var(--border,#e6d6b8);background:#fff;color:#5a4325;border-radius:11px;padding:.55rem 1rem;font-weight:700;font-size:.86rem;cursor:pointer}' +
      '.qbt-tab.on{background:var(--deep,#1a0f00);border-color:var(--deep,#1a0f00);color:#e8c068}' +
      '.qbt-pane{display:none}.qbt-pane.on{display:block}' +
      '.qbt-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.8rem;margin-bottom:1rem}' +
      '.qbt-card{background:var(--card,#fff);border:1.5px solid var(--border,#e6d6b8);border-radius:13px;padding:.85rem 1rem}' +
      '.qbt-card b{display:block;font-size:1.25rem;color:var(--deep,#1a0f00)}' +
      '.qbt-card span{font-size:.74rem;color:var(--muted,#8a7552);text-transform:uppercase;letter-spacing:.4px}' +
      '.qbt-card small{display:block;font-size:.7rem;color:#b3761e;margin-top:2px}' +
      '.qbt-card.hi{background:var(--deep,#1a0f00);border-color:var(--deep,#1a0f00)}.qbt-card.hi b{color:#e8c068}.qbt-card.hi span{color:#c9b48a}' +
      '.qbt-card.pf b{color:#0a7d33}.qbt-card.neg b{color:#d93025}' +
      '.qbt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:1rem;margin-bottom:1rem}' +
      '.qbt-box{background:var(--card,#fff);border:1.5px solid var(--border,#e6d6b8);border-radius:15px;padding:.9rem 1rem 1rem;margin-bottom:1rem}' +
      '.qbt-grid .qbt-box{margin-bottom:0}' +
      '.qbt-box h4{margin:0 0 .6rem;font-size:.95rem;color:var(--deep,#1a0f00)}' +
      '.qbt-cv{position:relative;height:250px}' +
      '.qbt-tools{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}' +
      '.qbt-wrap{overflow-x:auto}' +
      '.qbt table{width:100%;border-collapse:collapse;font-size:.84rem}' +
      '.qbt th{text-align:left;padding:.55rem .6rem;border-bottom:2px solid var(--border,#e6d6b8);font-size:.72rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted,#8a7552);white-space:nowrap}' +
      '.qbt td{padding:.55rem .6rem;border-bottom:1px solid var(--border,#efe3cc);vertical-align:top}' +
      '.qbt td.r,.qbt th.r{text-align:right;white-space:nowrap}' +
      '.qbt .it{font-size:.78rem;line-height:1.45;min-width:200px}.qbt .it small,.qbt small.m{color:var(--muted,#8a7552)}' +
      '.qbt .pt{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700;background:#efe2c8;color:#5a4325}' +
      '.qbt .pt.upi{background:#dbe7ff;color:#1b4aa8}.qbt .pt.card{background:#ffe4d6;color:#a84a1b}.qbt .pt.cash{background:#dcf5e3;color:#0a6b2d}' +
      '.qbt .pt.new{background:#fff3c4;color:#8a6a00}.qbt .pt.confirmed,.qbt .pt.processing,.qbt .pt.ready{background:#dbe7ff;color:#1b4aa8}.qbt .pt.delivered{background:#dcf5e3;color:#0a6b2d}' +
      '.qbt .dl{border:none;background:#f3e3e0;color:#b3261e;border-radius:8px;padding:4px 8px;cursor:pointer}' +
      '.qbt .pos{color:#0a7d33;font-weight:800}.qbt .neg{color:#d93025;font-weight:800}.qbt .na{color:#b3a07a}' +
      '.qbt tfoot td{font-weight:800;border-top:2px solid var(--border,#e6d6b8);background:#faf4e8}' +
      '.qbt-empty{text-align:center;color:var(--muted,#8a7552);padding:1.5rem}' +
      '.qbt-note{font-size:.76rem;color:var(--muted,#8a7552);line-height:1.5;margin:.2rem 0 .9rem}' +
      '.qbt-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:1rem}' +
      '.qbt-md{background:#fff;border-radius:16px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden}' +
      '.qbt-md .mh{display:flex;justify-content:space-between;align-items:center;padding:.9rem 1.1rem;border-bottom:1.5px solid var(--border,#e6d6b8)}.qbt-md .mh h4{margin:0}' +
      '.qbt-md .mb{overflow-y:auto;padding:.8rem 1.1rem 1rem}' +
      '.qbt-md table{width:100%;border-collapse:collapse;font-size:.84rem}.qbt-md th,.qbt-md td{padding:.45rem .5rem;border-bottom:1px solid #efe3cc;text-align:left}.qbt-md td.r,.qbt-md th.r{text-align:right}' +
      '.qbt-md input[type=number]{width:110px;padding:.4rem .5rem;border:1.5px solid var(--border,#e6d6b8);border-radius:8px}';
    document.head.appendChild(st);
  }

  /* ---------- skeleton ---------- */
  function mount() {
    var el = $('qb-tally'); if (el) return el;
    var anchor = $('tally-stats'); if (!anchor) return null;
    addStyle();
    el = document.createElement('div'); el.id = 'qb-tally'; el.className = 'qbt';
    el.innerHTML =
      '<div class="qbt-head"><div><h3>📊 Sales &amp; Profit – Counter Bills + Site Orders</h3><p>Counter (printer) bills come from the common database – every phone &amp; device</p></div>' +
      '<div class="qbt-tools"><button class="btn-gh" id="qbt-refresh" style="font-size:.82rem;padding:.45rem .9rem">🔄 Refresh</button>' +
      '<button class="btn-gh" id="qbt-pp" style="font-size:.82rem;padding:.45rem .9rem">💰 Purchase prices</button></div></div>' +

      '<div class="qbt-bar"><label>📅 From</label><input type="date" id="qbt-from"/><label>To</label><input type="date" id="qbt-to"/>' +
      '<button class="qbt-q" data-q="today">Today</button><button class="qbt-q" data-q="yest">Yesterday</button><button class="qbt-q" data-q="7">Last 7 days</button><button class="qbt-q" data-q="month">This month</button><button class="qbt-q" data-q="clear">✕ Clear</button>' +
      '<label style="margin-left:.4rem">Show by</label><select id="qbt-grp"><option value="auto">Auto</option><option value="day">Day-wise</option><option value="month">Month-wise</option></select>' +
      '<label style="display:flex;gap:.3rem;align-items:center"><input type="checkbox" id="qbt-showp"/> Profit column in lists</label>' +
      '<span class="qbt-lbl" id="qbt-label"></span></div>' +

      '<div class="qbt-tabs"><button class="qbt-tab on" data-tab="ov">📊 Overview</button><button class="qbt-tab" data-tab="ct">🖨 Counter Bills</button>' +
      '<button class="qbt-tab" data-tab="st">🌐 Site Orders</button><button class="qbt-tab" data-tab="pf">💰 Profit</button></div>' +

      /* overview */
      '<div class="qbt-pane on" id="qbt-p-ov"><div class="qbt-cards" id="qbt-ov-cards"></div>' +
      '<div class="qbt-box"><h4 id="qbt-ov-t">Sales trend</h4><div class="qbt-cv"><canvas id="qbt-c-ov"></canvas></div></div>' +
      '<div class="qbt-box" style="padding:0"><div style="padding:.9rem 1rem;border-bottom:1.5px solid var(--border,#e6d6b8)"><h4 style="margin:0" id="qbt-ov-th">Date-wise sales</h4></div>' +
      '<div class="qbt-wrap"><table><thead id="qbt-ov-h"></thead><tbody id="qbt-ov-b"></tbody><tfoot id="qbt-ov-f"></tfoot></table></div></div></div>' +

      /* counter */
      '<div class="qbt-pane" id="qbt-p-ct"><div class="qbt-cards" id="qbt-ct-cards"></div>' +
      '<div class="qbt-grid"><div class="qbt-box"><h4>Payment type (Cash / UPI / Card)</h4><div class="qbt-cv"><canvas id="qbt-c-pay"></canvas></div></div>' +
      '<div class="qbt-box"><h4>Top items (counter)</h4><div class="qbt-cv"><canvas id="qbt-c-top"></canvas></div></div>' +
      '<div class="qbt-box"><h4>Busy hours</h4><div class="qbt-cv"><canvas id="qbt-c-hr"></canvas></div></div></div>' +
      '<div class="qbt-box" style="padding:0"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;padding:.9rem 1rem;border-bottom:1.5px solid var(--border,#e6d6b8)"><h4 style="margin:0">🖨 Counter bills – every bill</h4>' +
      '<div class="qbt-tools"><input id="qbt-cq" placeholder="Search bill no / item…" style="width:180px"/><select id="qbt-cpay"><option value="">All payments</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select>' +
      '<button class="btn-gh" id="qbt-ccsv" style="font-size:.8rem;padding:.4rem .8rem">⬇️ Excel</button></div></div>' +
      '<div class="qbt-wrap"><table><thead id="qbt-ct-h"></thead><tbody id="qbt-ct-b"></tbody><tfoot id="qbt-ct-f"></tfoot></table></div>' +
      '<div style="text-align:center;padding:.7rem"><button class="btn-gh" id="qbt-cmore" style="display:none">Show more</button></div></div></div>' +

      /* site */
      '<div class="qbt-pane" id="qbt-p-st"><div class="qbt-cards" id="qbt-st-cards"></div>' +
      '<div class="qbt-grid"><div class="qbt-box"><h4>Orders by status</h4><div class="qbt-cv"><canvas id="qbt-c-sts"></canvas></div></div>' +
      '<div class="qbt-box"><h4>Top items (site)</h4><div class="qbt-cv"><canvas id="qbt-c-stop"></canvas></div></div></div>' +
      '<div class="qbt-box" style="padding:0"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;padding:.9rem 1rem;border-bottom:1.5px solid var(--border,#e6d6b8)"><h4 style="margin:0">🌐 Site orders – every order</h4>' +
      '<div class="qbt-tools"><input id="qbt-oq" placeholder="Search order / name / phone / item…" style="width:210px"/><select id="qbt-ost"><option value="">All status</option><option value="new">New</option><option value="confirmed">Confirmed</option><option value="processing">Processing</option><option value="ready">Ready</option><option value="delivered">Delivered</option></select>' +
      '<button class="btn-gh" id="qbt-ocsv" style="font-size:.8rem;padding:.4rem .8rem">⬇️ Excel</button></div></div>' +
      '<div class="qbt-wrap"><table><thead id="qbt-st-h"></thead><tbody id="qbt-st-b"></tbody><tfoot id="qbt-st-f"></tfoot></table></div>' +
      '<div style="text-align:center;padding:.7rem"><button class="btn-gh" id="qbt-omore" style="display:none">Show more</button></div></div></div>' +

      /* profit */
      '<div class="qbt-pane" id="qbt-p-pf"><div class="qbt-cards" id="qbt-pf-cards"></div>' +
      '<div class="qbt-note" id="qbt-pf-note"></div>' +
      '<div class="qbt-box"><h4 id="qbt-pf-t">Profit trend</h4><div class="qbt-cv"><canvas id="qbt-c-pf"></canvas></div></div>' +
      '<div class="qbt-box" style="padding:0"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;padding:.9rem 1rem;border-bottom:1.5px solid var(--border,#e6d6b8)"><h4 style="margin:0" id="qbt-pf-th">Profit – date-wise</h4>' +
      '<button class="btn-gh" id="qbt-pcsv" style="font-size:.8rem;padding:.4rem .8rem">⬇️ Excel</button></div>' +
      '<div class="qbt-wrap"><table><thead id="qbt-pf-h"></thead><tbody id="qbt-pf-b"></tbody><tfoot id="qbt-pf-f"></tfoot></table></div></div></div>';
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    wire(); return el;
  }

  function wire() {
    $('qbt-refresh').onclick = function () { loadData(true).then(render); };
    $('qbt-pp').onclick = openPP;
    $('qb-tally').addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]'); if (q) return quick(q.dataset.q);
      var t = e.target.closest('[data-tab]'); if (t) return setTab(t.dataset.tab);
      var d = e.target.closest('[data-del]'); if (d) return delBill(d.dataset.del);
    });
    $('qbt-from').onchange = $('qbt-to').onchange = render;
    $('qbt-grp').onchange = render;
    $('qbt-showp').onchange = function () { F.profit = this.checked; renderLists(); };
    $('qbt-cq').oninput = function () { F.q = norm(this.value); shown.c = 100; renderCt(); };
    $('qbt-cpay').onchange = function () { F.pay = this.value; shown.c = 100; renderCt(); };
    $('qbt-oq').oninput = function () { F.oq = norm(this.value); shown.o = 100; renderSt(); };
    $('qbt-ost').onchange = function () { F.ost = this.value; shown.o = 100; renderSt(); };
    $('qbt-cmore').onclick = function () { shown.c += 200; renderCt(); };
    $('qbt-omore').onclick = function () { shown.o += 200; renderSt(); };
    $('qbt-ccsv').onclick = csvCounter; $('qbt-ocsv').onclick = csvSite; $('qbt-pcsv').onclick = csvProfit;
  }

  /* ---------- data ---------- */
  function loadData(force) {
    if (!tok()) return Promise.resolve();
    var p = [];
    if (force || !BILLS.length || Date.now() - fetchedAt > 15000)
      p.push(get('/bills?limit=5000').then(function (d) { if (d.success) { BILLS = d.bills; fetchedAt = Date.now(); } }).catch(function () {}));
    if (force || !Object.keys(PRODS).length)
      p.push(fetch(api() + '/products').then(function (r) { return r.json(); }).then(function (d) {
        if (d.success) { PRODS = {}; d.products.forEach(function (x) { PRODS[x._id] = { id: x._id, name: x.name, price: x.price, cat: x.category }; }); }
      }).catch(function () {}));
    return Promise.all(p).then(function () { return loadPrices(force); });
  }
  function loadPrices(force) {
    var ys = {}; ys[new Date().getFullYear()] = 1;
    BILLS.forEach(function (b) { ys[new Date(b.billDate).getFullYear()] = 1; });
    allOrders().forEach(function (o) { ys[new Date(o.createdAt).getFullYear()] = 1; });
    var todo = Object.keys(ys).filter(function (y) { return force || !PPRAW[y]; });
    return Promise.all(todo.map(function (y) {
      return get('/purchaseprices?year=' + y).then(function (d) { PPRAW[y] = d.success ? d.prices : []; }).catch(function () { PPRAW[y] = PPRAW[y] || []; });
    })).then(buildIdx);
  }
  /* same price book as the Final Report: key = name || unit || salesPrice || month || year */
  function buildIdx() {
    var map = {};
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i); if (!/^vbs_pp_\d+_\d+$/.test(k)) continue;
        var o = JSON.parse(localStorage.getItem(k) || '{}');
        Object.keys(o).forEach(function (kk) { var a = kk.split('||'); if (a.length >= 5) map[norm(a[0]) + '|' + a[2] + '|' + a[3] + '|' + a[4]] = { name: norm(a[0]), sp: parseFloat(a[2]), m: parseInt(a[3], 10), y: parseInt(a[4], 10), price: Number(o[kk]) }; });
      }
    } catch (e) {}
    Object.keys(PPRAW).forEach(function (y) {
      (PPRAW[y] || []).forEach(function (p) {
        var sp = parseFloat(String(p.unit || '').split('||')[1]);
        map[norm(p.productName) + '|' + (isFinite(sp) ? sp : '') + '|' + p.month + '|' + p.year] = { name: norm(p.productName), sp: sp, m: p.month, y: p.year, price: Number(p.price) };
      });
    });
    IDX = {};
    Object.keys(map).forEach(function (k) { var e = map[k]; if (e.price > 0) (IDX[e.y] = IDX[e.y] || []).push(e); });
    PPVER++;
  }
  function pick(list, rate) {
    var best = null, bd = 1e18;
    list.forEach(function (e) { var dd = isFinite(e.sp) ? Math.abs(e.sp - rate) : 0.5; if (dd < bd) { bd = dd; best = e; } });
    return best ? best.price : null;
  }
  /* purchase price for that month; if not set, the latest earlier month's price is used */
  function costFor(name, rate, d) {
    var y = d.getFullYear(), m = d.getMonth(), n = norm(name);
    var named = (IDX[y] || []).filter(function (e) { return e.name === n; }), c;
    if (named.length) {
      c = pick(named.filter(function (e) { return e.m === m; }), rate); if (c != null) return c;
      var earlier = named.filter(function (e) { return e.m < m; }).sort(function (a, b) { return b.m - a.m; });
      if (earlier.length) { c = pick(earlier.filter(function (e) { return e.m === earlier[0].m; }), rate); if (c != null) return c; }
    }
    var prev = (IDX[y - 1] || []).filter(function (e) { return e.name === n; }).sort(function (a, b) { return b.m - a.m; });
    if (prev.length) return pick(prev.filter(function (e) { return e.m === prev[0].m; }), rate);
    return null;
  }

  /* ---------- profit maths ---------- */
  /* Counter bill: profit = taxable value (GST is NOT profit) - purchase cost */
  function calcBill(b) {
    if (b.__v === PPVER) return b.__c;
    var d = new Date(b.billDate), tot = 0, cost = 0, profit = 0, miss = 0, sales = 0;
    b.items.forEach(function (i) { tot += Number(i.amount) || 0; });
    b.items.forEach(function (i) {
      var share = tot > 0 ? b.taxable * ((Number(i.amount) || 0) / tot) : 0;
      var nm = (PRODS[i.productId] || {}).name || i.name;
      var c = costFor(nm, Number(i.rate), d); if (c == null) { miss++; return; }
      var cc = c * (Number(i.qty) || 0); cost += cc; profit += share - cc; sales += share;
    });
    b.__c = { cost: cost, profit: profit, miss: miss, sales: sales }; b.__v = PPVER; return b.__c;
  }
  /* Site order: same method as your Final Report (amount received - purchase price x qty) */
  function calcOrder(o) {
    if (o.__v === PPVER) return o.__c;
    var d = new Date(o.createdAt), tot = 0, cost = 0, profit = 0, miss = 0, sales = 0;
    o.items.forEach(function (i) { tot += (Number(i.price) || 0) * (Number(i.quantity) || 0); });
    var ratio = tot > 0 ? (Number(o.totalAmount) || 0) / tot : 1;
    o.items.forEach(function (i) {
      var sl = (Number(i.price) || 0) * (Number(i.quantity) || 0) * ratio;
      var c = costFor(i.name, Number(i.price), d); if (c == null) { miss++; return; }
      var cc = c * (Number(i.quantity) || 0); cost += cc; profit += sl - cc; sales += sl;
    });
    o.__c = { cost: cost, profit: profit, miss: miss, sales: sales }; o.__v = PPVER; return o.__c;
  }

  /* ---------- date range ---------- */
  function sel() {
    var ys = $('tally-year'), ms = $('tally-month');
    var y = parseInt(ys && ys.value, 10) || new Date().getFullYear();
    var m = ms && ms.value !== '' && ms.value != null ? parseInt(ms.value, 10) : null;
    return { y: y, m: m };
  }
  function ensureYears() {
    var ys = $('tally-year'); if (!ys) return;
    var have = [].map.call(ys.options, function (o) { return o.value; }), wasEmpty = !have.length;
    BILLS.forEach(function (b) { var y = String(new Date(b.billDate).getFullYear()); if (have.indexOf(y) < 0) { ys.add(new Option(y, y)); have.push(y); } });
    if (wasEmpty || !ys.value) ys.value = String(new Date().getFullYear());
  }
  function getRange() {
    var f = $('qbt-from').value, t = $('qbt-to').value, from, to, label, custom = false;
    if (f || t) {
      custom = true; from = f ? new Date(f + 'T00:00:00') : null; to = t ? new Date(t + 'T23:59:59.999') : null;
      label = f && t && f === t ? fmtD(from) : ((f ? fmtD(from) : 'Start') + ' → ' + (t ? fmtD(to) : 'Today'));
    } else {
      var s = sel();
      if (s.m === null) { from = new Date(s.y, 0, 1); to = new Date(s.y, 11, 31, 23, 59, 59, 999); label = 'Year ' + s.y; }
      else { from = new Date(s.y, s.m, 1); to = new Date(s.y, s.m + 1, 0, 23, 59, 59, 999); label = MONTHS[s.m] + ' ' + s.y; }
    }
    return { from: from, to: to, label: label, custom: custom };
  }
  function inR(dt, R) { var d = new Date(dt); return (!R.from || d >= R.from) && (!R.to || d <= R.to); }
  function quick(k) {
    var n = new Date(), a = null, b = null;
    if (k === 'today') { a = b = n; }
    else if (k === 'yest') { a = b = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 1); }
    else if (k === '7') { a = new Date(n.getFullYear(), n.getMonth(), n.getDate() - 6); b = n; }
    else if (k === 'month') { a = new Date(n.getFullYear(), n.getMonth(), 1); b = n; }
    $('qbt-from').value = a ? iso(a) : ''; $('qbt-to').value = b ? iso(b) : '';
    render();
  }

  /* ---------- grouping (day / month) ---------- */
  function pad0(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function bounds(R, dates) {
    var mn = R.from, mx = R.to;
    if (!mn || !mx) {
      var ds = dates.slice().sort(function (a, b) { return a - b; });
      if (!mn) mn = ds.length ? ds[0] : new Date();
      if (!mx) mx = ds.length ? ds[ds.length - 1] : new Date();
    }
    return { a: pad0(mn), b: pad0(mx) };
  }
  function chooseMode(span) {
    var g = $('qbt-grp').value;
    if (g === 'day') return span > 366 ? 'month' : 'day';
    if (g === 'month') return 'month';
    return span <= 62 ? 'day' : 'month';
  }
  function keyOf(d, mode) { return mode === 'day' ? iso(d) : d.getFullYear() + '-' + p2(d.getMonth() + 1); }
  function labelOf(k, mode) {
    if (mode === 'month') { var p = k.split('-'); return MONTHS[parseInt(p[1], 10) - 1] + ' ' + p[0]; }
    var d = new Date(k + 'T00:00:00'); return p2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear() + ' (' + DAYS[d.getDay()] + ')';
  }
  function shortLabel(k, mode) {
    if (mode === 'month') return MONTHS[parseInt(k.split('-')[1], 10) - 1];
    return String(parseInt(k.split('-')[2], 10));
  }
  function periodKeys(b, mode) {
    var keys = [], d = new Date(b.a);
    if (mode === 'day') { while (d <= b.b) { keys.push(iso(d)); d.setDate(d.getDate() + 1); } }
    else { d = new Date(b.a.getFullYear(), b.a.getMonth(), 1); while (d <= b.b) { keys.push(keyOf(d, 'month')); d.setMonth(d.getMonth() + 1); } }
    return keys;
  }
  function aggregate(bills, orders, keys, mode) {
    var m = {}; keys.forEach(function (k) { m[k] = { cn: 0, cs: 0, cp: 0, cm: 0, on: 0, os: 0, op: 0, om: 0 }; });
    bills.forEach(function (b) { var r = m[keyOf(new Date(b.billDate), mode)]; if (!r) return; var c = calcBill(b); r.cn++; r.cs += b.total; r.cp += c.profit; r.cm += c.miss; });
    orders.forEach(function (o) { var r = m[keyOf(new Date(o.createdAt), mode)]; if (!r) return; var c = calcOrder(o); r.on++; r.os += Number(o.totalAmount) || 0; r.op += c.profit; r.om += c.miss; });
    return m;
  }
  function items(b) { return b.items.reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0); }
  function pcell(v, miss) { return '<span class="' + (v >= 0 ? 'pos' : 'neg') + '">' + (v >= 0 ? '+' : '−') + rs(Math.abs(v)) + '</span>' + (miss ? ' <small class="m" title="Purchase price missing for some items – set it in 💰 Purchase prices">⚠' + miss + '</small>' : ''); }

  /* ---------- charts ---------- */
  function mk(id, cfg) {
    var cv = $(id); if (!cv) return;
    if (typeof Chart === 'undefined') { cv.parentNode.innerHTML = '<div class="qbt-empty">Chart library did not load – check internet</div>'; return; }
    if (charts[id]) { try { charts[id].destroy(); } catch (e) {} }
    cfg.options = cfg.options || {}; cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
    charts[id] = new Chart(cv.getContext('2d'), cfg);
  }
  function drawCharts() {
    if (!D) return;
    var keys = D.keys, mode = D.mode, lab = keys.map(function (k) { return shortLabel(k, mode); });
    var ttl = mode === 'day' ? 'day' : 'month';
    if (tab === 'ov') {
      $('qbt-ov-t').textContent = 'Sales by ' + ttl + ' – Counter bills vs Site orders';
      mk('qbt-c-ov', { type: 'bar', data: { labels: lab, datasets: [
        { label: 'Counter bills', data: keys.map(function (k) { return r2(D.agg[k].cs); }), backgroundColor: COL.gold, stack: 's' },
        { label: 'Site orders', data: keys.map(function (k) { return r2(D.agg[k].os); }), backgroundColor: COL.dark, stack: 's' }] },
        options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: function (v) { return '₹' + v; } } } } } });
    } else if (tab === 'ct') {
      var p = { cash: 0, upi: 0, card: 0 };
      D.bills.forEach(function (b) { p[pay(b)] = (p[pay(b)] || 0) + (Number(b.total) || 0); });
      mk('qbt-c-pay', { type: 'doughnut', data: { labels: ['Cash', 'UPI', 'Card'], datasets: [{ data: [r2(p.cash), r2(p.upi), r2(p.card)], backgroundColor: [COL.green, COL.blue, COL.red] }] },
        options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return c.label + ': ' + rs(c.parsed); } } } } } });
      var im = {};
      D.bills.forEach(function (b) { b.items.forEach(function (i) { var k = i.name; im[k] = im[k] || { rev: 0, qty: 0 }; im[k].rev += Number(i.amount) || 0; im[k].qty += Number(i.qty) || 0; }); });
      var top = Object.keys(im).sort(function (a, b) { return im[b].rev - im[a].rev; }).slice(0, 8);
      mk('qbt-c-top', { type: 'bar', data: { labels: top, datasets: [{ label: 'Sales ₹', data: top.map(function (k) { return r2(im[k].rev); }), backgroundColor: COL.gold }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { return 'Qty: ' + r2(im[top[c.dataIndex]].qty); } } } }, scales: { x: { beginAtZero: true } } } });
      var hr = new Array(24).fill(0), hc = new Array(24).fill(0);
      D.bills.forEach(function (b) { var h = new Date(b.billDate).getHours(); hr[h] += Number(b.total) || 0; hc[h]++; });
      var hl = [], hd = [], hcn = [];
      for (var h = 7; h <= 22; h++) { hl.push((h % 12 || 12) + (h >= 12 ? 'pm' : 'am')); hd.push(r2(hr[h])); hcn.push(hc[h]); }
      mk('qbt-c-hr', { type: 'bar', data: { labels: hl, datasets: [{ label: 'Sales ₹', data: hd, backgroundColor: COL.light, borderColor: COL.gold, borderWidth: 1 }] },
        options: { plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { return hcn[c.dataIndex] + ' bills'; } } } }, scales: { y: { beginAtZero: true } } } });
    } else if (tab === 'st') {
      var sc = {}; D.orders.forEach(function (o) { sc[o.status] = (sc[o.status] || 0) + 1; });
      var sk = Object.keys(sc), sCol = { new: '#e0b100', confirmed: COL.blue, processing: '#7a5cd6', ready: '#17a2b8', delivered: COL.green };
      mk('qbt-c-sts', { type: 'doughnut', data: { labels: sk.map(function (k) { return k.charAt(0).toUpperCase() + k.slice(1); }), datasets: [{ data: sk.map(function (k) { return sc[k]; }), backgroundColor: sk.map(function (k) { return sCol[k] || '#999'; }) }] }, options: { plugins: { legend: { position: 'bottom' } } } });
      var om = {};
      D.orders.forEach(function (o) {
        var t = o.items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0), ra = t > 0 ? o.totalAmount / t : 1;
        o.items.forEach(function (i) { om[i.name] = om[i.name] || { rev: 0, qty: 0 }; om[i.name].rev += i.price * i.quantity * ra; om[i.name].qty += i.quantity; });
      });
      var ot = Object.keys(om).sort(function (a, b) { return om[b].rev - om[a].rev; }).slice(0, 8);
      mk('qbt-c-stop', { type: 'bar', data: { labels: ot, datasets: [{ label: 'Sales ₹', data: ot.map(function (k) { return r2(om[k].rev); }), backgroundColor: COL.dark }] },
        options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { return 'Qty: ' + r2(om[ot[c.dataIndex]].qty); } } } }, scales: { x: { beginAtZero: true } } } });
    } else if (tab === 'pf') {
      $('qbt-pf-t').textContent = 'Profit by ' + ttl + ' – Counter bills vs Site orders';
      mk('qbt-c-pf', { type: 'bar', data: { labels: lab, datasets: [
        { label: 'Counter profit', data: keys.map(function (k) { return r2(D.agg[k].cp); }), backgroundColor: COL.gold },
        { label: 'Site profit', data: keys.map(function (k) { return r2(D.agg[k].op); }), backgroundColor: COL.dark }] },
        options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: function (v) { return '₹' + v; } } } } } });
    }
  }

  /* ---------- panes ---------- */
  function card(v, l, cls, sub) { return '<div class="qbt-card ' + (cls || '') + '"><b>' + v + '</b><span>' + l + '</span>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; }

  function renderOv() {
    var cs = 0, os = 0, cp = 0, op = 0, miss = 0;
    D.bills.forEach(function (b) { cs += b.total; var c = calcBill(b); cp += c.profit; miss += c.miss; });
    D.orders.forEach(function (o) { os += Number(o.totalAmount) || 0; var c = calcOrder(o); op += c.profit; miss += c.miss; });
    var tp = cp + op;
    $('qbt-ov-cards').innerHTML =
      card(D.orders.length, 'Site orders') + card(rs(os), 'Site sales') +
      card(D.bills.length, 'Counter bills') + card(rs(cs), 'Counter sales') +
      card(rs(cs + os), 'Total sales', 'hi') +
      card((tp >= 0 ? '' : '−') + rs(Math.abs(tp)), 'Total profit', tp >= 0 ? 'pf' : 'neg', miss ? '⚠ ' + miss + ' items without purchase price' : '');
    $('qbt-ov-th').textContent = D.mode === 'day' ? 'Date-wise sales' : 'Month-wise sales';
    $('qbt-ov-h').innerHTML = '<tr><th>' + (D.mode === 'day' ? 'Date' : 'Month') + '</th><th class="r">Counter bills</th><th class="r">Counter ₹</th><th class="r">Site orders</th><th class="r">Site ₹</th><th class="r">Total ₹</th></tr>';
    var t = { cn: 0, cs: 0, on: 0, os: 0 }, rows = D.keys.slice().reverse().filter(function (k) { var r = D.agg[k]; return r.cn || r.on; });
    $('qbt-ov-b').innerHTML = rows.length ? rows.map(function (k) {
      var r = D.agg[k]; t.cn += r.cn; t.cs += r.cs; t.on += r.on; t.os += r.os;
      return '<tr><td><b>' + esc(labelOf(k, D.mode)) + '</b></td><td class="r">' + r.cn + '</td><td class="r">' + rs(r.cs) + '</td><td class="r">' + r.on + '</td><td class="r">' + rs(r.os) + '</td><td class="r"><b>' + rs(r.cs + r.os) + '</b></td></tr>';
    }).join('') : '<tr><td colspan="6" class="qbt-empty">No sales in this period</td></tr>';
    $('qbt-ov-f').innerHTML = rows.length ? '<tr><td>Total</td><td class="r">' + t.cn + '</td><td class="r">' + rs(t.cs) + '</td><td class="r">' + t.on + '</td><td class="r">' + rs(t.os) + '</td><td class="r">' + rs(t.cs + t.os) + '</td></tr>' : '';
  }

  function filteredBills() {
    return D.bills.filter(function (b) {
      if (F.pay && pay(b) !== F.pay) return false;
      if (!F.q) return true;
      return norm(b.billNo + ' ' + b.items.map(function (i) { return i.name + ' ' + (i.tamilName || ''); }).join(' ')).indexOf(F.q) >= 0;
    });
  }
  function renderCt() {
    if (!D) return;
    var all = D.bills, sales = 0, tx = 0, cg = 0, sg = 0, q = 0, p = { cash: 0, upi: 0, card: 0 };
    all.forEach(function (b) { sales += b.total; tx += b.taxable; cg += b.cgst; sg += b.sgst; q += items(b); p[pay(b)] = (p[pay(b)] || 0) + b.total; });
    $('qbt-ct-cards').innerHTML = card(all.length, 'Counter bills') + card(rs(sales), 'Counter sales', 'hi') +
      card(rs(p.cash), '💵 Cash') + card(rs(p.upi), '📱 UPI') + card(rs(p.card), '💳 Card') +
      card(rs(tx), 'Taxable value') + card(rs(cg), 'CGST 2.5%') + card(rs(sg), 'SGST 2.5%') + card(r2(q), 'Items sold') + card(rs(all.length ? sales / all.length : 0), 'Avg bill');
    var list = filteredBills(), pf = F.profit;
    $('qbt-ct-h').innerHTML = '<tr><th>Bill No</th><th>Date &amp; time</th><th>Items</th><th>Pay</th><th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">Total</th>' + (pf ? '<th class="r">Profit</th>' : '') + '<th></th></tr>';
    var cols = pf ? 10 : 9;
    if (!tok()) { $('qbt-ct-b').innerHTML = '<tr><td colspan="' + cols + '" class="qbt-empty">Login again to load counter bills</td></tr>'; $('qbt-ct-f').innerHTML = ''; return; }
    $('qbt-ct-b').innerHTML = list.length ? list.slice(0, shown.c).map(function (b) {
      var d = new Date(b.billDate), c = calcBill(b);
      var it = b.items.map(function (i) { return esc(i.name) + (i.tamilName ? ' <small>(' + esc(i.tamilName) + ')</small>' : '') + ' × ' + r2(i.qty) + ' = ' + rs(i.amount); }).join('<br>');
      return '<tr><td><b>' + esc(b.billNo) + '</b></td><td style="white-space:nowrap">' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '<br><small class="m">' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '</small></td>' +
        '<td class="it">' + it + (b.adjustment ? '<br><small>' + (b.adjustment < 0 ? 'Discount ' : 'Round-off +') + rs(Math.abs(b.adjustment)) + '</small>' : '') + '</td>' +
        '<td><span class="pt ' + pay(b) + '">' + (PAY[pay(b)] || pay(b)) + '</span></td><td class="r">' + rs(b.taxable) + '</td><td class="r">' + rs(b.cgst) + '</td><td class="r">' + rs(b.sgst) + '</td><td class="r"><b>' + rs(b.total) + '</b></td>' +
        (pf ? '<td class="r">' + (c.miss === b.items.length ? '<span class="na">—</span>' : pcell(c.profit, c.miss)) + '</td>' : '') +
        '<td><button class="dl" data-del="' + esc(b._id) + '" title="Delete bill">🗑</button></td></tr>';
    }).join('') : '<tr><td colspan="' + cols + '" class="qbt-empty">No counter bills for this period</td></tr>';
    var t = { tx: 0, cg: 0, sg: 0, tot: 0, pr: 0 };
    list.forEach(function (b) { t.tx += b.taxable; t.cg += b.cgst; t.sg += b.sgst; t.tot += b.total; t.pr += calcBill(b).profit; });
    $('qbt-ct-f').innerHTML = list.length ? '<tr><td colspan="4">Total (' + list.length + ' bills)</td><td class="r">' + rs(t.tx) + '</td><td class="r">' + rs(t.cg) + '</td><td class="r">' + rs(t.sg) + '</td><td class="r">' + rs(t.tot) + '</td>' + (pf ? '<td class="r">' + pcell(t.pr, 0) + '</td>' : '') + '<td></td></tr>' : '';
    $('qbt-cmore').style.display = list.length > shown.c ? 'inline-block' : 'none';
  }

  function filteredOrders() {
    return D.orders.filter(function (o) {
      if (F.ost && o.status !== F.ost) return false;
      if (!F.oq) return true;
      return norm((o.orderId || '') + ' ' + ((o.customer || {}).name || '') + ' ' + ((o.customer || {}).phone || '') + ' ' + o.items.map(function (i) { return i.name; }).join(' ')).indexOf(F.oq) >= 0;
    }).sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  }
  function payName(m) { return m === 'cod' ? 'COD' : String(m || '').toUpperCase(); }
  function renderSt() {
    if (!D) return;
    var all = D.orders, rev = 0, q = 0, del = 0;
    all.forEach(function (o) { rev += Number(o.totalAmount) || 0; q += o.items.reduce(function (s, i) { return s + i.quantity; }, 0); if (o.status === 'delivered') del++; });
    $('qbt-st-cards').innerHTML = card(all.length, 'Site orders') + card(rs(rev), 'Site sales', 'hi') + card(q, 'Items sold') + card(rs(all.length ? rev / all.length : 0), 'Avg order') + card(del, 'Delivered');
    var list = filteredOrders(), pf = F.profit, cols = pf ? 8 : 7;
    $('qbt-st-h').innerHTML = '<tr><th>Order</th><th>Date</th><th>Customer</th><th>Items</th><th>Pay</th><th>Status</th><th class="r">Amount</th>' + (pf ? '<th class="r">Profit</th>' : '') + '</tr>';
    $('qbt-st-b').innerHTML = list.length ? list.slice(0, shown.o).map(function (o) {
      var d = new Date(o.createdAt), c = calcOrder(o), cu = o.customer || {};
      var it = o.items.map(function (i) { return esc(i.name) + ' × ' + r2(i.quantity) + ' = ' + rs(i.price * i.quantity); }).join('<br>');
      return '<tr><td><b>' + esc(o.orderId || '') + '</b></td><td style="white-space:nowrap">' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '<br><small class="m">' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '</small></td>' +
        '<td>' + esc(cu.name || '') + '<br><small class="m">' + esc(cu.phone || '') + '</small></td><td class="it">' + it + (o.discount ? '<br><small>Discount ' + rs(o.discount) + '</small>' : '') + '</td>' +
        '<td>' + esc(payName(o.paymentMethod)) + '</td><td><span class="pt ' + esc(o.status) + '">' + esc(o.status) + '</span></td><td class="r"><b>' + rs(o.totalAmount) + '</b></td>' +
        (pf ? '<td class="r">' + (c.miss === o.items.length ? '<span class="na">—</span>' : pcell(c.profit, c.miss)) + '</td>' : '') + '</tr>';
    }).join('') : '<tr><td colspan="' + cols + '" class="qbt-empty">No site orders for this period</td></tr>';
    var t = { a: 0, p: 0 }; list.forEach(function (o) { t.a += Number(o.totalAmount) || 0; t.p += calcOrder(o).profit; });
    $('qbt-st-f').innerHTML = list.length ? '<tr><td colspan="6">Total (' + list.length + ' orders)</td><td class="r">' + rs(t.a) + '</td>' + (pf ? '<td class="r">' + pcell(t.p, 0) + '</td>' : '') + '</tr>' : '';
    $('qbt-omore').style.display = list.length > shown.o ? 'inline-block' : 'none';
  }

  function renderPf() {
    var cs = 0, os = 0, cp = 0, op = 0, miss = 0, costed = 0;
    D.bills.forEach(function (b) { cs += b.total; var c = calcBill(b); cp += c.profit; miss += c.miss; costed += c.sales; });
    D.orders.forEach(function (o) { os += Number(o.totalAmount) || 0; var c = calcOrder(o); op += c.profit; miss += c.miss; costed += c.sales; });
    var tp = cp + op, margin = costed > 0 ? (tp / costed) * 100 : 0;
    $('qbt-pf-cards').innerHTML =
      card((cp >= 0 ? '' : '−') + rs(Math.abs(cp)), '🖨 Counter profit', cp >= 0 ? 'pf' : 'neg') +
      card((op >= 0 ? '' : '−') + rs(Math.abs(op)), '🌐 Site profit', op >= 0 ? 'pf' : 'neg') +
      card((tp >= 0 ? '' : '−') + rs(Math.abs(tp)), 'Total profit', tp >= 0 ? 'pf' : 'neg', miss ? '⚠ ' + miss + ' items without purchase price' : '') +
      card(costed > 0 ? r2(margin) + '%' : '—', 'Profit margin') + card(rs(cs + os), 'Total sales', 'hi');
    $('qbt-pf-note').innerHTML = '💡 Profit = what you received − purchase price × qty. For <b>counter bills</b> the GST (CGST + SGST) is not counted as profit. Purchase prices are the same ones you enter in the <b>Final Report</b> (if a month has none, the latest earlier month is used). Items with no purchase price are skipped – use <b>💰 Purchase prices</b> to add them.';
    $('qbt-pf-th').textContent = D.mode === 'day' ? 'Profit – date-wise' : 'Profit – month-wise';
    $('qbt-pf-h').innerHTML = '<tr><th>' + (D.mode === 'day' ? 'Date' : 'Month') + '</th><th class="r">Counter sales</th><th class="r">Counter profit</th><th class="r">Site sales</th><th class="r">Site profit</th><th class="r">Total profit</th></tr>';
    var t = { cs: 0, cp: 0, os: 0, op: 0 }, rows = D.keys.slice().reverse().filter(function (k) { var r = D.agg[k]; return r.cn || r.on; });
    $('qbt-pf-b').innerHTML = rows.length ? rows.map(function (k) {
      var r = D.agg[k]; t.cs += r.cs; t.cp += r.cp; t.os += r.os; t.op += r.op;
      return '<tr><td><b>' + esc(labelOf(k, D.mode)) + '</b></td><td class="r">' + rs(r.cs) + '</td><td class="r">' + (r.cn ? pcell(r.cp, r.cm) : '<span class="na">—</span>') + '</td><td class="r">' + rs(r.os) + '</td><td class="r">' + (r.on ? pcell(r.op, r.om) : '<span class="na">—</span>') + '</td><td class="r"><b>' + pcell(r.cp + r.op, 0) + '</b></td></tr>';
    }).join('') : '<tr><td colspan="6" class="qbt-empty">No sales in this period</td></tr>';
    $('qbt-pf-f').innerHTML = rows.length ? '<tr><td>Total</td><td class="r">' + rs(t.cs) + '</td><td class="r">' + pcell(t.cp, 0) + '</td><td class="r">' + rs(t.os) + '</td><td class="r">' + pcell(t.op, 0) + '</td><td class="r">' + pcell(t.cp + t.op, 0) + '</td></tr>' : '';
  }
  function renderLists() { if (!D) return; renderCt(); renderSt(); }

  function setTab(t) {
    tab = t;
    [].forEach.call(document.querySelectorAll('.qbt-tab'), function (b) { b.classList.toggle('on', b.dataset.tab === t); });
    [].forEach.call(document.querySelectorAll('.qbt-pane'), function (p) { p.classList.toggle('on', p.id === 'qbt-p-' + t); });
    drawCharts();      // charts are drawn only for the visible tab
  }

  /* ---------- main render ---------- */
  function render() {
    if (!mount()) return;
    ensureYears();
    var R = getRange();
    var bills = BILLS.filter(function (b) { return inR(b.billDate, R); });
    var orders = allOrders().filter(function (o) { return inR(o.createdAt, R); });
    var dates = bills.map(function (b) { return new Date(b.billDate); }).concat(orders.map(function (o) { return new Date(o.createdAt); }));
    var bd = bounds(R, dates), span = Math.round((bd.b - bd.a) / 86400000) + 1, mode = chooseMode(span);
    var keys = periodKeys(bd, mode);
    D = { R: R, bills: bills, orders: orders, mode: mode, keys: keys, agg: aggregate(bills, orders, keys, mode) };
    $('qbt-label').textContent = '📅 ' + R.label + (R.custom ? '' : '  (Year/Month above)');
    shown.c = 100; shown.o = 100;
    renderOv(); renderCt(); renderSt(); renderPf(); drawCharts();
  }

  /* ---------- delete a counter bill ---------- */
  function delBill(id) {
    var b = BILLS.filter(function (x) { return x._id === id; })[0]; if (!b) return;
    if (!confirm('Delete bill ' + b.billNo + ' (' + rs(b.total) + ')? This removes it from all records.')) return;
    fetch(api() + '/bills/' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.success) throw new Error(d.message || 'Failed'); BILLS = BILLS.filter(function (x) { return x._id !== id; }); render(); say('🗑', 'Bill deleted'); })
      .catch(function (e) { say('❌', e.message); });
  }

  /* ---------- Excel (CSV) downloads ---------- */
  function csv(name, rows) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = name + '.csv'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function stamp() { return D.R.custom ? ($('qbt-from').value || 'start') + '_to_' + ($('qbt-to').value || 'today') : D.R.label.replace(/\s+/g, '-'); }
  function csvCounter() {
    var l = filteredBills(); if (!l.length) return say('⚠️', 'No bills to download');
    var rows = [['Bill No', 'Date', 'Time', 'Payment', 'Items', 'Qty', 'Discount/Round-off', 'Taxable', 'CGST', 'SGST', 'Total', 'Profit']];
    l.forEach(function (b) { var d = new Date(b.billDate), c = calcBill(b); rows.push([b.billNo, d.toLocaleDateString('en-IN'), d.toLocaleTimeString('en-IN'), PAY[pay(b)] || pay(b), b.items.map(function (i) { return i.name + ' x' + i.qty + ' @' + i.rate; }).join('; '), r2(items(b)), b.adjustment || 0, b.taxable, b.cgst, b.sgst, b.total, c.miss === b.items.length ? '' : r2(c.profit)]); });
    csv('counter-bills-' + stamp(), rows);
  }
  function csvSite() {
    var l = filteredOrders(); if (!l.length) return say('⚠️', 'No orders to download');
    var rows = [['Order', 'Date', 'Time', 'Customer', 'Phone', 'Items', 'Payment', 'Status', 'Amount', 'Profit']];
    l.forEach(function (o) { var d = new Date(o.createdAt), c = calcOrder(o), cu = o.customer || {}; rows.push([o.orderId, d.toLocaleDateString('en-IN'), d.toLocaleTimeString('en-IN'), cu.name, cu.phone, o.items.map(function (i) { return i.name + ' x' + i.quantity + ' @' + i.price; }).join('; '), payName(o.paymentMethod), o.status, o.totalAmount, c.miss === o.items.length ? '' : r2(c.profit)]); });
    csv('site-orders-' + stamp(), rows);
  }
  function csvProfit() {
    var rows = [[D.mode === 'day' ? 'Date' : 'Month', 'Counter bills', 'Counter sales', 'Counter profit', 'Site orders', 'Site sales', 'Site profit', 'Total profit']];
    D.keys.slice().reverse().forEach(function (k) { var r = D.agg[k]; if (!r.cn && !r.on) return; rows.push([labelOf(k, D.mode), r.cn, r2(r.cs), r2(r.cp), r.on, r2(r.os), r2(r.op), r2(r.cp + r.op)]); });
    if (rows.length < 2) return say('⚠️', 'No data to download');
    csv('profit-' + stamp(), rows);
  }

  /* ---------- purchase prices (same price book as the Final Report) ---------- */
  function openPP() {
    var base = (D && D.R.from) || new Date(), st = { y: base.getFullYear(), m: base.getMonth(), q: '' };
    var ov = document.createElement('div'); ov.className = 'qbt-ov';
    ov.innerHTML = '<div class="qbt-md"><div class="mh"><h4>💰 Purchase prices</h4><button class="btn-gh" data-x style="padding:.3rem .7rem">✕ Close</button></div>' +
      '<div class="mb"><div class="qbt-tools" style="margin-bottom:.6rem"><select id="qpp-m"></select><select id="qpp-y"></select><input id="qpp-q" placeholder="Search product…" style="flex:1;min-width:140px"/></div>' +
      '<div class="qbt-note">Enter what <b>you pay</b> per piece/litre for each product in the chosen month. The same prices are used by the <b>Final Report</b>. If a month has no price, the latest earlier month is used.</div><div id="qpp-list"></div></div></div>';
    document.body.appendChild(ov);
    var ms = ov.querySelector('#qpp-m'), ysel = ov.querySelector('#qpp-y');
    MONTHS.forEach(function (n, i) { ms.add(new Option(n, i)); });
    var cy = new Date().getFullYear(); for (var y = cy - 2; y <= cy + 1; y++) ysel.add(new Option(y, y));
    ms.value = st.m; ysel.value = st.y;
    function exact(name, sp) { var r = null; (IDX[st.y] || []).forEach(function (e) { if (e.name === norm(name) && e.m === st.m && e.sp === sp) r = e.price; }); return r; }
    function draw() {
      var list = Object.keys(PRODS).map(function (k) { return PRODS[k]; }).filter(function (p) { return !st.q || norm(p.name).indexOf(st.q) >= 0; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
      ov.querySelector('#qpp-list').innerHTML = '<table><thead><tr><th>Product</th><th class="r">Selling ₹</th><th class="r">Purchase ₹</th><th></th></tr></thead><tbody>' + list.map(function (p) {
        var v = exact(p.name, p.price);
        return '<tr><td>' + esc(p.name) + '</td><td class="r">' + rs(p.price) + '</td><td class="r"><input type="number" min="0" step="any" data-id="' + esc(p.id) + '" value="' + (v == null ? '' : v) + '" placeholder="₹"/></td>' +
          '<td><button class="btn-g" data-save="' + esc(p.id) + '" style="font-size:.74rem;padding:.3rem .7rem">Save</button></td></tr>';
      }).join('') + '</tbody></table>';
    }
    ov.addEventListener('click', function (e) {
      if (e.target === ov || e.target.closest('[data-x]')) { document.body.removeChild(ov); render(); return; }
      var b = e.target.closest('[data-save]'); if (!b) return;
      var p = PRODS[b.dataset.save], inp = ov.querySelector('input[data-id="' + b.dataset.save + '"]'), val = parseFloat(inp.value);
      if (!p || !isFinite(val) || val < 0) return say('⚠️', 'Enter a valid price');
      b.disabled = true;
      fetch(api() + '/purchaseprices', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok() }, body: JSON.stringify({ productName: p.name, unit: 'per pcs||' + p.price, month: st.m, year: st.y, price: val }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (!d.success) throw new Error(d.message || 'Failed');
          var lsk = 'vbs_pp_' + st.m + '_' + st.y, o = {}; try { o = JSON.parse(localStorage.getItem(lsk) || '{}'); } catch (x) {}
          o[p.name + '||per pcs||' + p.price + '||' + st.m + '||' + st.y] = val; localStorage.setItem(lsk, JSON.stringify(o));
          PPRAW[st.y] = (PPRAW[st.y] || []).filter(function (x) { return !(x.productName === p.name && x.unit === 'per pcs||' + p.price && x.month === st.m); });
          PPRAW[st.y].push({ productName: p.name, unit: 'per pcs||' + p.price, month: st.m, year: st.y, price: val });
          buildIdx(); say('✅', 'Saved'); b.textContent = '✔ Saved';
        })
        .catch(function (er) { say('❌', er.message); })
        .then(function () { b.disabled = false; });
    });
    ms.onchange = function () { st.m = parseInt(ms.value, 10); draw(); };
    ysel.onchange = function () { st.y = parseInt(ysel.value, 10); loadPrices(false).then(draw); };
    ov.querySelector('#qpp-q').oninput = function () { st.q = norm(this.value); draw(); };
    draw();
  }

  /* ---------- hook into the existing Tally functions ---------- */
  function hook() {
    if (typeof window.renderTally === 'function') {
      var rt = window.renderTally;
      window.renderTally = function () { var r = rt.apply(this, arguments); try { render(); } catch (e) { console.error('Tally add-on:', e); } return r; };
    }
    if (typeof window.loadTally === 'function') {
      var lt = window.loadTally;
      window.loadTally = function () {
        var p = lt.apply(this, arguments);
        loadData(false).then(function () { try { render(); } catch (e) { console.error(e); } });
        return p;
      };
    }
  }
  hook();
  window.qbTally = { render: render, reload: function () { return loadData(true).then(render); } };
})();
