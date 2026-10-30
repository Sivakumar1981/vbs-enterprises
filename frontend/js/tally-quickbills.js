/* ============================================================
   VBS Enterprises – Tally add-on: Counter Bills (Quick Bill)
   Plugs into the existing Tally tab WITHOUT changing its code:
   - reads every Quick Bill from the common database (all phones)
   - shows All-activity totals, 4 graphs and a full bill-by-bill table
   - follows the Year / Month selectors already on the Tally page
   ============================================================ */
(function () {
  'use strict';
  var BILLS = [], fetchedAt = 0, charts = {}, shown = 100;
  var F = { q: '', pay: '' };
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PAY = { cash: 'Cash', upi: 'UPI', card: 'Card' };
  var COL = { gold: '#c8902a', dark: '#3b2410', green: '#0a9d3f', blue: '#2a62c8', red: '#d93025', light: '#e8c068' };

  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function rs(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
  function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function tok() { return (typeof token !== 'undefined' && token) || localStorage.getItem('vbs_atoken') || ''; }
  function api() { return typeof API !== 'undefined' ? API : '/api'; }
  function say(icon, m) { try { if (typeof toast === 'function') toast(icon, m); } catch (e) {} }
  function pay(b) { return b.paymentType || 'cash'; }

  /* ---------- styles (scoped: qbt-) ---------- */
  function addStyle() {
    if ($('qbt-style')) return;
    var st = document.createElement('style'); st.id = 'qbt-style';
    st.textContent =
      '.qbt{margin:0 0 1.5rem}' +
      '.qbt-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:.75rem;margin:0 0 .9rem}' +
      '.qbt-head h3{font-family:"Cormorant Garamond",serif;font-size:1.4rem;color:var(--deep,#1a0f00);margin:0}' +
      '.qbt-head p{font-size:.78rem;color:var(--muted,#8a7552);margin:.15rem 0 0}' +
      '.qbt-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.8rem;margin-bottom:1rem}' +
      '.qbt-card{background:var(--card,#fff);border:1.5px solid var(--border,#e6d6b8);border-radius:13px;padding:.85rem 1rem}' +
      '.qbt-card b{display:block;font-size:1.25rem;color:var(--deep,#1a0f00)}' +
      '.qbt-card span{font-size:.74rem;color:var(--muted,#8a7552);text-transform:uppercase;letter-spacing:.4px}' +
      '.qbt-card.hi{background:var(--deep,#1a0f00);border-color:var(--deep,#1a0f00)}.qbt-card.hi b{color:#e8c068}.qbt-card.hi span{color:#c9b48a}' +
      '.qbt-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(310px,1fr));gap:1rem;margin-bottom:1rem}' +
      '.qbt-box{background:var(--card,#fff);border:1.5px solid var(--border,#e6d6b8);border-radius:15px;padding:.9rem 1rem 1rem}' +
      '.qbt-box h4{margin:0 0 .6rem;font-size:.95rem;color:var(--deep,#1a0f00)}' +
      '.qbt-cv{position:relative;height:250px}' +
      '.qbt-tools{display:flex;gap:.5rem;flex-wrap:wrap;align-items:center}' +
      '.qbt-tools input,.qbt-tools select{padding:.45rem .7rem;border:1.5px solid var(--border,#e6d6b8);border-radius:8px;font-size:.84rem;background:#fff}' +
      '.qbt-wrap{overflow-x:auto}' +
      '.qbt table{width:100%;border-collapse:collapse;font-size:.84rem}' +
      '.qbt th{text-align:left;padding:.55rem .6rem;border-bottom:2px solid var(--border,#e6d6b8);font-size:.72rem;text-transform:uppercase;letter-spacing:.4px;color:var(--muted,#8a7552);white-space:nowrap}' +
      '.qbt td{padding:.55rem .6rem;border-bottom:1px solid var(--border,#efe3cc);vertical-align:top}' +
      '.qbt td.r,.qbt th.r{text-align:right;white-space:nowrap}' +
      '.qbt .it{font-size:.78rem;line-height:1.45;min-width:200px}.qbt .it small{color:var(--muted,#8a7552)}' +
      '.qbt .pt{display:inline-block;padding:2px 8px;border-radius:999px;font-size:.7rem;font-weight:700;background:#efe2c8;color:#5a4325}' +
      '.qbt .pt.upi{background:#dbe7ff;color:#1b4aa8}.qbt .pt.card{background:#ffe4d6;color:#a84a1b}.qbt .pt.cash{background:#dcf5e3;color:#0a6b2d}' +
      '.qbt .dl{border:none;background:#f3e3e0;color:#b3261e;border-radius:8px;padding:4px 8px;cursor:pointer}' +
      '.qbt tfoot td{font-weight:800;border-top:2px solid var(--border,#e6d6b8);background:#faf4e8}' +
      '.qbt-empty{text-align:center;color:var(--muted,#8a7552);padding:1.5rem}';
    document.head.appendChild(st);
  }

  /* ---------- mount the section once ---------- */
  function mount() {
    var el = $('qb-tally'); if (el) return el;
    var anchor = $('tally-stats'); if (!anchor) return null;
    addStyle();
    el = document.createElement('div'); el.id = 'qb-tally'; el.className = 'qbt';
    el.innerHTML =
      '<div class="qbt-head"><div><h3>🧾 Counter Bills (Quick Bill)</h3><p>Common database – bills from every phone &amp; device · follows the Year / Month above</p></div>' +
      '<div class="qbt-tools"><button class="btn-gh" id="qbt-refresh" style="font-size:.82rem;padding:.45rem .9rem">🔄 Refresh</button>' +
      '<button class="btn-gh" id="qbt-csv" style="font-size:.82rem;padding:.45rem .9rem">⬇️ Download Excel (CSV)</button></div></div>' +
      '<div class="qbt-cards" id="qbt-all"></div>' +
      '<div class="qbt-cards" id="qbt-stats"></div>' +
      '<div class="qbt-grid" id="qbt-charts">' +
      '<div class="qbt-box"><h4 id="qbt-t1">Sales trend</h4><div class="qbt-cv"><canvas id="qbt-c1"></canvas></div></div>' +
      '<div class="qbt-box"><h4>Payment type (Cash / UPI / Card)</h4><div class="qbt-cv"><canvas id="qbt-c2"></canvas></div></div>' +
      '<div class="qbt-box"><h4>Top items (counter sales)</h4><div class="qbt-cv"><canvas id="qbt-c3"></canvas></div></div>' +
      '<div class="qbt-box"><h4>Busy hours (sales by hour)</h4><div class="qbt-cv"><canvas id="qbt-c4"></canvas></div></div></div>' +
      '<div class="qbt-box" style="padding:0">' +
      '<div class="tc-top" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:.6rem;padding:.9rem 1rem;border-bottom:1.5px solid var(--border,#e6d6b8)"><h4 style="margin:0">📋 Every bill – full details</h4>' +
      '<div class="qbt-tools"><input id="qbt-q" placeholder="Search bill no / item…" style="width:190px"/>' +
      '<select id="qbt-pay"><option value="">All payments</option><option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option></select></div></div>' +
      '<div class="qbt-wrap"><table><thead><tr><th>Bill No</th><th>Date &amp; time</th><th>Items</th><th>Pay</th>' +
      '<th class="r">Taxable</th><th class="r">CGST</th><th class="r">SGST</th><th class="r">Total</th><th></th></tr></thead>' +
      '<tbody id="qbt-rows"></tbody><tfoot id="qbt-foot"></tfoot></table></div>' +
      '<div style="text-align:center;padding:.7rem"><button class="btn-gh" id="qbt-more" style="display:none">Show more</button></div></div>';
    anchor.parentNode.insertBefore(el, anchor.nextSibling);

    $('qbt-refresh').onclick = function () { fetchBills(true).then(render); };
    $('qbt-csv').onclick = downloadCsv;
    $('qbt-q').oninput = function () { F.q = this.value.trim().toLowerCase(); shown = 100; renderRows(); };
    $('qbt-pay').onchange = function () { F.pay = this.value; shown = 100; renderRows(); };
    $('qbt-more').onclick = function () { shown += 200; renderRows(); };
    $('qbt-rows').onclick = function (e) { var b = e.target.closest('[data-del]'); if (b) delBill(b.dataset.del); };
    return el;
  }

  /* ---------- data ---------- */
  function fetchBills(force) {
    if (!force && BILLS.length && Date.now() - fetchedAt < 15000) return Promise.resolve();
    if (!tok()) return Promise.resolve();
    return fetch(api() + '/bills?limit=5000', { headers: { Authorization: 'Bearer ' + tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.success) { BILLS = d.bills; fetchedAt = Date.now(); } })
      .catch(function () {});
  }
  function sel() {
    var ys = $('tally-year'), ms = $('tally-month');
    var y = parseInt(ys && ys.value, 10) || new Date().getFullYear();
    var m = ms && ms.value !== '' && ms.value != null ? parseInt(ms.value, 10) : null;
    return { y: y, m: m };
  }
  function ensureYears() {
    var ys = $('tally-year'); if (!ys) return;
    var have = [].map.call(ys.options, function (o) { return o.value; });
    var wasEmpty = !have.length;
    BILLS.forEach(function (b) { var y = String(new Date(b.billDate).getFullYear()); if (have.indexOf(y) < 0) { ys.add(new Option(y, y)); have.push(y); } });
    if (wasEmpty || !ys.value) ys.value = String(new Date().getFullYear());
  }
  function inRange(dt, s) { var d = new Date(dt); return d.getFullYear() === s.y && (s.m === null || d.getMonth() === s.m); }
  function myBills(s) { return BILLS.filter(function (b) { return inRange(b.billDate, s); }); }
  function myOrders(s) {
    var arr = (typeof allOrdersCache !== 'undefined' && allOrdersCache) ? allOrdersCache : [];
    return arr.filter(function (o) { return inRange(o.createdAt, s); });
  }
  function items(b) { return b.items.reduce(function (n, i) { return n + (Number(i.qty) || 0); }, 0); }

  /* ---------- charts ---------- */
  function mk(id, cfg) {
    if (typeof Chart === 'undefined') { var c = $(id); if (c && c.parentNode) c.parentNode.innerHTML = '<div class="qbt-empty">Chart library did not load – check internet</div>'; return; }
    if (charts[id]) { try { charts[id].destroy(); } catch (e) {} }
    var cv = $(id); if (!cv) return;
    cfg.options = cfg.options || {}; cfg.options.responsive = true; cfg.options.maintainAspectRatio = false;
    charts[id] = new Chart(cv.getContext('2d'), cfg);
  }
  function drawCharts(s, bills, orders) {
    var labels = [], ord = [], cnt = [], monthMode = s.m === null;
    if (monthMode) { labels = MONTHS.slice(); ord = new Array(12).fill(0); cnt = new Array(12).fill(0); }
    else { var n = new Date(s.y, s.m + 1, 0).getDate(); for (var d = 1; d <= n; d++) labels.push(String(d)); ord = new Array(n).fill(0); cnt = new Array(n).fill(0); }
    function idx(dt) { var x = new Date(dt); return monthMode ? x.getMonth() : x.getDate() - 1; }
    orders.forEach(function (o) { ord[idx(o.createdAt)] += Number(o.totalAmount) || 0; });
    bills.forEach(function (b) { cnt[idx(b.billDate)] += Number(b.total) || 0; });
    $('qbt-t1').textContent = monthMode ? 'Sales by month – Online orders vs Counter bills' : 'Sales by day – Online orders vs Counter bills';
    mk('qbt-c1', { type: 'bar', data: { labels: labels, datasets: [
      { label: 'Counter bills', data: cnt.map(r2), backgroundColor: COL.gold, stack: 's' },
      { label: 'Online orders', data: ord.map(r2), backgroundColor: COL.dark, stack: 's' }] },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true, ticks: { callback: function (v) { return '₹' + v; } } } } } });

    var p = { cash: 0, upi: 0, card: 0 };
    bills.forEach(function (b) { p[pay(b)] = (p[pay(b)] || 0) + (Number(b.total) || 0); });
    mk('qbt-c2', { type: 'doughnut', data: { labels: ['Cash', 'UPI', 'Card'], datasets: [{ data: [r2(p.cash), r2(p.upi), r2(p.card)], backgroundColor: [COL.green, COL.blue, COL.red] }] },
      options: { plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: function (c) { return c.label + ': ' + rs(c.parsed); } } } } } });

    var im = {};
    bills.forEach(function (b) { b.items.forEach(function (i) { var k = i.name; if (!im[k]) im[k] = { rev: 0, qty: 0 }; im[k].rev += Number(i.amount) || 0; im[k].qty += Number(i.qty) || 0; }); });
    var top = Object.keys(im).sort(function (a, b) { return im[b].rev - im[a].rev; }).slice(0, 8);
    mk('qbt-c3', { type: 'bar', data: { labels: top, datasets: [{ label: 'Sales ₹', data: top.map(function (k) { return r2(im[k].rev); }), backgroundColor: COL.gold }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { return 'Qty: ' + r2(im[top[c.dataIndex]].qty); } } } }, scales: { x: { beginAtZero: true } } } });

    var hr = new Array(24).fill(0), hc = new Array(24).fill(0);
    bills.forEach(function (b) { var h = new Date(b.billDate).getHours(); hr[h] += Number(b.total) || 0; hc[h]++; });
    var lo = 7, hi = 22; var hl = [], hd = [], hcn = [];
    for (var h = lo; h <= hi; h++) { hl.push((h % 12 || 12) + (h >= 12 ? 'pm' : 'am')); hd.push(r2(hr[h])); hcn.push(hc[h]); }
    mk('qbt-c4', { type: 'bar', data: { labels: hl, datasets: [{ label: 'Sales ₹', data: hd, backgroundColor: COL.light, borderColor: COL.gold, borderWidth: 1 }] },
      options: { plugins: { legend: { display: false }, tooltip: { callbacks: { afterLabel: function (c) { return hcn[c.dataIndex] + ' bills'; } } } }, scales: { y: { beginAtZero: true } } } });
  }

  /* ---------- cards ---------- */
  function drawCards(bills, orders) {
    var sales = 0, tx = 0, cg = 0, sg = 0, q = 0, p = { cash: 0, upi: 0, card: 0 };
    bills.forEach(function (b) { sales += b.total; tx += b.taxable; cg += b.cgst; sg += b.sgst; q += items(b); p[pay(b)] = (p[pay(b)] || 0) + b.total; });
    var oRev = orders.reduce(function (s, o) { return s + (Number(o.totalAmount) || 0); }, 0);
    $('qbt-all').innerHTML =
      '<div class="qbt-card"><b>' + orders.length + '</b><span>Online orders</span></div>' +
      '<div class="qbt-card"><b>' + rs(oRev) + '</b><span>Online revenue</span></div>' +
      '<div class="qbt-card"><b>' + bills.length + '</b><span>Counter bills</span></div>' +
      '<div class="qbt-card"><b>' + rs(sales) + '</b><span>Counter sales</span></div>' +
      '<div class="qbt-card hi"><b>' + rs(oRev + sales) + '</b><span>All activity total</span></div>';
    $('qbt-stats').innerHTML =
      '<div class="qbt-card"><b>' + rs(p.cash) + '</b><span>💵 Cash</span></div>' +
      '<div class="qbt-card"><b>' + rs(p.upi) + '</b><span>📱 UPI</span></div>' +
      '<div class="qbt-card"><b>' + rs(p.card) + '</b><span>💳 Card</span></div>' +
      '<div class="qbt-card"><b>' + rs(tx) + '</b><span>Taxable value</span></div>' +
      '<div class="qbt-card"><b>' + rs(cg) + '</b><span>CGST 2.5%</span></div>' +
      '<div class="qbt-card"><b>' + rs(sg) + '</b><span>SGST 2.5%</span></div>' +
      '<div class="qbt-card"><b>' + r2(q) + '</b><span>Items sold</span></div>' +
      '<div class="qbt-card"><b>' + rs(bills.length ? sales / bills.length : 0) + '</b><span>Avg bill</span></div>';
  }

  /* ---------- table ---------- */
  function filtered() {
    var s = sel();
    return myBills(s).filter(function (b) {
      if (F.pay && pay(b) !== F.pay) return false;
      if (!F.q) return true;
      var hay = (b.billNo + ' ' + b.items.map(function (i) { return i.name + ' ' + (i.tamilName || ''); }).join(' ')).toLowerCase();
      return hay.indexOf(F.q) >= 0;
    });
  }
  function renderRows() {
    var list = filtered(), body = $('qbt-rows'); if (!body) return;
    if (!tok()) { body.innerHTML = '<tr><td colspan="9" class="qbt-empty">Login again to load counter bills</td></tr>'; $('qbt-foot').innerHTML = ''; return; }
    body.innerHTML = list.length ? list.slice(0, shown).map(function (b) {
      var d = new Date(b.billDate);
      var it = b.items.map(function (i) { return esc(i.name) + (i.tamilName ? ' <small>(' + esc(i.tamilName) + ')</small>' : '') + ' × ' + r2(i.qty) + ' = ' + rs(i.amount); }).join('<br>');
      return '<tr><td><b>' + esc(b.billNo) + '</b></td>' +
        '<td style="white-space:nowrap">' + d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) + '<br><small style="color:#8a7552">' + d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + '</small></td>' +
        '<td class="it">' + it + (b.adjustment ? '<br><small>' + (b.adjustment < 0 ? 'Discount ' : 'Round-off +') + rs(Math.abs(b.adjustment)) + '</small>' : '') + '</td>' +
        '<td><span class="pt ' + pay(b) + '">' + (PAY[pay(b)] || pay(b)) + '</span></td>' +
        '<td class="r">' + rs(b.taxable) + '</td><td class="r">' + rs(b.cgst) + '</td><td class="r">' + rs(b.sgst) + '</td>' +
        '<td class="r"><b>' + rs(b.total) + '</b></td>' +
        '<td><button class="dl" data-del="' + esc(b._id) + '" title="Delete bill">🗑</button></td></tr>';
    }).join('') : '<tr><td colspan="9" class="qbt-empty">No counter bills for this period</td></tr>';
    var t = { tx: 0, cg: 0, sg: 0, tot: 0 };
    list.forEach(function (b) { t.tx += b.taxable; t.cg += b.cgst; t.sg += b.sgst; t.tot += b.total; });
    $('qbt-foot').innerHTML = list.length ? '<tr><td colspan="4">Total (' + list.length + ' bills)</td><td class="r">' + rs(t.tx) + '</td><td class="r">' + rs(t.cg) + '</td><td class="r">' + rs(t.sg) + '</td><td class="r">' + rs(t.tot) + '</td><td></td></tr>' : '';
    $('qbt-more').style.display = list.length > shown ? 'inline-block' : 'none';
  }

  function delBill(id) {
    var b = BILLS.filter(function (x) { return x._id === id; })[0]; if (!b) return;
    if (!confirm('Delete bill ' + b.billNo + ' (' + rs(b.total) + ')? This removes it from all records.')) return;
    fetch(api() + '/bills/' + encodeURIComponent(id), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok() } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (!d.success) throw new Error(d.message || 'Failed'); BILLS = BILLS.filter(function (x) { return x._id !== id; }); render(); say('🗑', 'Bill deleted'); })
      .catch(function (e) { say('❌', e.message); });
  }

  function downloadCsv() {
    var list = filtered();
    if (!list.length) return say('⚠️', 'No bills to download');
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Bill No', 'Date', 'Time', 'Payment', 'Items', 'Qty', 'Discount/Round-off', 'Taxable', 'CGST', 'SGST', 'Total']];
    list.forEach(function (b) {
      var d = new Date(b.billDate);
      rows.push([b.billNo, d.toLocaleDateString('en-IN'), d.toLocaleTimeString('en-IN'), PAY[pay(b)] || pay(b),
        b.items.map(function (i) { return i.name + ' x' + i.qty + ' @' + i.rate; }).join('; '), r2(items(b)), b.adjustment || 0, b.taxable, b.cgst, b.sgst, b.total]);
    });
    var csv = '\ufeff' + rows.map(function (r) { return r.map(q).join(','); }).join('\r\n');
    var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    var s = sel(); a.download = 'counter-bills-' + s.y + (s.m === null ? '' : '-' + String(s.m + 1).padStart(2, '0')) + '.csv';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }

  /* ---------- render ---------- */
  function render() {
    if (!mount()) return;
    ensureYears();
    var s = sel(), bills = myBills(s), orders = myOrders(s);
    drawCards(bills, orders); drawCharts(s, bills, orders); renderRows();
  }

  /* ---------- hook into the existing Tally functions ---------- */
  function hook() {
    if (typeof window.renderTally === 'function') {
      var rt = window.renderTally;
      window.renderTally = function () { var r = rt.apply(this, arguments); try { render(); } catch (e) { console.error('Counter bills:', e); } return r; };
    }
    if (typeof window.loadTally === 'function') {
      var lt = window.loadTally;
      window.loadTally = function () {
        var p = lt.apply(this, arguments);
        fetchBills(false).then(function () { try { render(); } catch (e) { console.error(e); } });
        return p;
      };
    }
  }
  hook();
  window.qbTally = { render: render, reload: function () { return fetchBills(true).then(render); } };
})();
