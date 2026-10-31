/* ============================================================
   VBS Enterprises – Quick Bill (Android phone + thermal printer)
   - Tap products -> tap PRINT. No customer details, no stock check.
   - GST (CGST 2.5% + SGST 2.5%) is taken OUT of the total you enter,
     so the bill total never goes above what you typed.
   - Tamil + English via raster printing; English-only uses the
     printer's own text mode, which is the fastest.
   - Prints FIRST, saves to the server in the background (works offline).
   ============================================================ */
(function () {
  'use strict';
  var API = '/api';

  /* ---------- shop details printed on the bill (edit here) ---------- */
  var SHOP = {
    name:  'VBS ENTERPRISES',
    tag:   '(Marachekku Oil)',
    addr1: '108/7C, 5th Cross St, Rajiv Nagar',
    addr2: 'Pallikuppam, Vanagaram, Chennai-600077',
    phone: 'Ph: 9840042290 / 9840357267',
    msme:  'MSME UDYAM-TN-24-0183360',
    fssai: 'FSSAI: 22426477000262',
    gstin: 'GSTIN: 33FCHPS4318R1ZW'
  };
  var PAY = { cash: 'CASH', upi: 'UPI', card: 'CARD' };
  var ICONS = { saree: '👘', nighty: '🌙', chudidhar: '👗', blouse: '🪡', oil: '🫙', rice: '🌾', ghee: '🧈', honey: '🍯', peanut: '🥜', other: '📦' };

  var DEFAULTS = { width: 576, lang: 'both', method: 'ble', speed: 'fast', gst: 5, prefix: 'B', awake: true, hidden: ['saree', 'nighty', 'chudidhar', 'blouse'] };
  var SPEEDS = { turbo: [512, 2], fast: [240, 4], normal: [180, 10], safe: [100, 18] };   // [bytes per write, ms pause]
  var FONT = "'Noto Sans Tamil','Noto Sans','Nirmala UI','Latha','Tamil Sangam MN',Arial,Helvetica,sans-serif";

  /* ---------- tiny helpers ---------- */
  function $(id) { return document.getElementById(id); }
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function lsDel(k) { try { localStorage.removeItem(k); } catch (e) {} }
  function jget(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function jset(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  var S = Object.assign({}, DEFAULTS, jget('qb_settings', {}));
  function saveSettings() { jset('qb_settings', S); }

  /* ---------- money (all maths in paise = integers, so no rounding surprises) ---------- */
  function fmtP(p) { return (p / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtR(r) { return Number(r || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function fmtQty(q) { return String(Math.round(q * 1000) / 1000); }

  /* The total you enter is GST-INCLUSIVE. GST is taken out of it:
       taxable = total / (1 + gst%),  CGST + SGST = total - taxable   (split equally)
     taxable + CGST + SGST is always exactly the total, so it can never exceed it. */
  function splitGst(totalP, gstPct) {
    var taxable = Math.round(totalP * 100 / (100 + gstPct));
    var tax = totalP - taxable;
    var cgst = Math.floor(tax / 2);
    return { taxable: taxable, cgst: cgst, sgst: tax - cgst };
  }

  function computeBill(cart, finalTotalStr, gstPct) {
    var sum = 0;
    var lines = cart.map(function (l) {
      var amt = Math.round((Number(l.qty) || 0) * (Number(l.rate) || 0) * 100);
      sum += amt;
      return { l: l, amt: amt };
    });
    var total = sum, adj = 0;
    var ft = parseFloat(finalTotalStr);
    if (String(finalTotalStr || '').trim() !== '' && isFinite(ft) && ft >= 0) { total = Math.round(ft * 100); adj = total - sum; }
    var g = splitGst(total, gstPct);
    return { lines: lines, sum: sum, total: total, adj: adj, taxable: g.taxable, cgst: g.cgst, sgst: g.sgst };
  }

  /* ---------- state ---------- */
  var products = jget('qb_products', []);
  var cart = [];
  var cat = 'all', query = '';
  var needLogin = false;
  var payType = 'cash';

  /* ---------- toast ---------- */
  var toastT = null;
  function toast(msg, bad) {
    var t = $('toast'); t.textContent = msg; t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastT); toastT = setTimeout(function () { t.className = ''; }, bad ? 4500 : 2200);
  }

  /* ============================================================
     PRODUCTS
     ============================================================ */
  function slim(p) {
    return { id: p._id, name: p.name, short: p.shortName || '', ta: p.tamilName || '', price: p.price, cat: p.category || 'other', unit: p.unit || '', img: p.image || '' };
  }
  function imgUrl(image) {
    if (!image) return '';
    if (/^https?:/i.test(image)) return image.indexOf('/upload/') > 0 ? image.replace('/upload/', '/upload/w_260,h_200,c_fill,q_auto,f_auto/') : image;   // small Cloudinary thumbnail = loads fast
    return '/uploads/' + image;
  }
  function loadProducts() {
    renderCats(); renderGrid();
    return fetch(API + '/products').then(function (r) { return r.json(); }).then(function (d) {
      if (d.success) { products = d.products.map(slim); jset('qb_products', products); renderCats(); renderGrid(); }
      setNet(true);
    }).catch(function () { setNet(false); });
  }
  function setNet(on) { $('net').className = 'dot ' + (on ? 'on' : 'off'); $('net').title = on ? 'Online' : 'Offline – bills will be saved when internet returns'; }

  function enName(p) { return p.short || p.name; }
  function isHidden(c) { return (S.hidden || []).indexOf(String(c).toLowerCase()) >= 0; }
  function visibleProducts() { return products.filter(function (p) { return !isHidden(p.cat); }); }
  function capital(c) { return c.charAt(0).toUpperCase() + c.slice(1); }
  function renderCats() {
    var cats = ['all'];
    visibleProducts().forEach(function (p) { if (cats.indexOf(p.cat) < 0) cats.push(p.cat); });
    if (cats.indexOf(cat) < 0) cat = 'all';
    $('cats').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === cat ? ' on' : '') + '" data-cat="' + esc(c) + '">' + (c === 'all' ? 'All' : esc(capital(c))) + '</button>';
    }).join('');
  }
  function qtyOf(id) { return cart.reduce(function (s, l) { return s + (l.pid === id ? (Number(l.qty) || 0) : 0); }, 0); }
  function updateBadges() {
    document.querySelectorAll('#grid .tile').forEach(function (t) {
      var q = qtyOf(t.dataset.id); t.classList.toggle('in', q > 0); t.querySelector('.qb').textContent = fmtQty(q);
    });
  }
  function renderGrid() {
    var q = query.trim().toLowerCase();
    var list = visibleProducts().filter(function (p) {
      if (cat !== 'all' && p.cat !== cat) return false;
      if (!q) return true;
      return (p.name + ' ' + p.short + ' ' + p.ta).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { $('grid').innerHTML = '<div class="empty">No products found</div>'; return; }
    $('grid').innerHTML = list.map(function (p) {
      var u = imgUrl(p.img);
      return '<div class="tile" data-id="' + esc(p.id) + '">' +
        '<div class="ti' + (u ? '' : ' noimg') + '"><span>' + (ICONS[p.cat] || '📦') + '</span>' + (u ? '<img loading="lazy" decoding="async" alt="" src="' + esc(u) + '">' : '') + '</div>' +
        '<div class="qb">0</div><button class="mn" data-dec="' + esc(p.id) + '" aria-label="Remove one">−</button>' +
        '<button class="edit' + (p.ta ? '' : ' warn') + '" data-edit="' + esc(p.id) + '" title="Edit bill names">✏️</button>' +
        '<div class="tb"><div class="tn">' + esc(enName(p)) + '</div>' +
        (p.ta ? '<div class="tt">' + esc(p.ta) + '</div>' : '') +
        '<div class="tp">₹' + fmtR(p.price) + '</div></div></div>';
    }).join('');
    updateBadges();
  }

  /* ============================================================
     CART
     ============================================================ */
  function addProduct(p) {
    var hit = cart.filter(function (l) { return l.pid === p.id && l.rate === p.price; })[0];
    if (hit) hit.qty = Math.round((hit.qty + 1) * 1000) / 1000;
    else cart.push({ pid: p.id, en: enName(p), ta: p.ta, rate: p.price, qty: 1 });
    renderCart();
    if (S.method === 'ble' && BLE.device && !isConnected() && !BLE.wait) scheduleReconnect(0);
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
  }
  function decProduct(id) {
    for (var i = cart.length - 1; i >= 0; i--) {
      if (cart[i].pid === id) {
        cart[i].qty = Math.round((Number(cart[i].qty) - 1) * 1000) / 1000;
        if (cart[i].qty <= 0) cart.splice(i, 1);
        break;
      }
    }
    renderCart();
  }
  function addCustom() {
    var name = prompt('Item name (short):'); if (!name) return;
    var rate = parseFloat(prompt('Price (₹, GST included):')); if (!isFinite(rate) || rate < 0) return;
    cart.push({ pid: '', en: name.trim(), ta: '', rate: rate, qty: 1 }); renderCart();
  }

  function renderCart() {
    var box = $('lines');
    if (!cart.length) box.innerHTML = '<div class="empty">Tap a product to add it</div>';
    else box.innerHTML = cart.map(function (l, i) {
      return '<div class="ln" data-i="' + i + '">' +
        '<div class="ln-top"><div class="ln-name">' + esc(l.en) + (l.ta ? ' <small>' + esc(l.ta) + '</small>' : '') + '</div>' +
        '<button class="x" data-act="del">✕</button></div>' +
        '<div class="ln-row">' +
        '<div class="step"><button data-act="dec">−</button><input data-f="qty" type="number" inputmode="decimal" step="any" min="0" value="' + l.qty + '"><button data-act="inc">+</button></div>' +
        '<div class="mul">×</div><input class="rate" data-f="rate" type="number" inputmode="decimal" step="any" min="0" value="' + l.rate + '">' +
        '<div class="amt" id="amt' + i + '"></div></div></div>';
    }).join('');
    updateTotals();
  }
  function updateTotals() {
    var b = computeBill(cart, $('finalTotal').value, S.gst);
    b.lines.forEach(function (x, i) { var e = $('amt' + i); if (e) e.textContent = '₹' + fmtP(x.amt); });
    var n = cart.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
    $('sumCount').textContent = cart.length ? (cart.length + (cart.length === 1 ? ' item' : ' items') + ' · qty ' + fmtQty(n)) : 'No items';
    $('sumTotal').textContent = '₹' + fmtP(b.total);
    var half = S.gst / 2;
    $('taxInfo').innerHTML = cart.length
      ? 'Taxable ₹' + fmtP(b.taxable) + ' &nbsp;|&nbsp; CGST ' + half + '% ₹' + fmtP(b.cgst) + ' &nbsp;|&nbsp; SGST ' + half + '% ₹' + fmtP(b.sgst) +
        (b.adj ? '<br>' + (b.adj < 0 ? 'Discount ₹' + fmtP(-b.adj) : 'Round-off +₹' + fmtP(b.adj)) + ' applied (items ₹' + fmtP(b.sum) + ')' : '')
      : '';
    $('printBtn').disabled = !cart.length;
    $('previewBtn').disabled = !cart.length;
    updateBadges();
  }
  function setPay(p) { payType = p; document.querySelectorAll('#pay [data-pay]').forEach(function (b) { b.classList.toggle('on', b.dataset.pay === p); }); }
  function clearCart() { cart = []; $('finalTotal').value = ''; setPay('cash'); renderCart(); }

  /* Build the bill object (rupees, 2 decimals) */
  function nextNo() { return (parseInt(lsGet('qb_seq', '0'), 10) || 0) + 1; }
  function makeBill() {
    var b = computeBill(cart, $('finalTotal').value, S.gst);
    var no = nextNo();
    return {
      clientId: uid(),
      billNo: S.prefix + '-' + String(no).padStart(4, '0'),
      billDate: new Date().toISOString(),
      items: b.lines.map(function (x) {
        return { productId: x.l.pid || '', name: x.l.en, tamilName: x.l.ta || '', qty: Number(x.l.qty), rate: Number(x.l.rate), amount: x.amt / 100 };
      }),
      paymentType: payType,
      itemsTotal: b.sum / 100, adjustment: b.adj / 100, gstRate: S.gst,
      taxable: b.taxable / 100, cgst: b.cgst / 100, sgst: b.sgst / 100, total: b.total / 100,
      _no: no
    };
  }

  /* ============================================================
     RECEIPT – FAST HYBRID
     Everything is the printer's own text (instant, tiny) EXCEPT Tamil
     item names, which are sent as small cropped pictures.
     ============================================================ */
  function displayName(it, lang) {
    if (lang === 'tamil') return it.tamilName || it.name;
    if (lang === 'english') return it.name;
    return it.tamilName ? it.tamilName + ' / ' + it.name : it.name;
  }
  function dateStr(d) { return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear(); }
  function timeStr(d) { var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return pad2(h) + ':' + pad2(d.getMinutes()) + ' ' + ap; }
  function isAscii(s) { return /^[\x20-\x7e]*$/.test(s || ''); }
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  /* small picture of one text block, cropped to the text width (less data = faster) */
  function textStrip(str, W, align) {
    var Sc = W / 576, M = Math.round(6 * Sc), sz = Math.round(25 * Sc), lh = Math.round(sz * 1.25);
    var t = makeCanvas(10, 10).getContext('2d'); t.font = 'bold ' + sz + 'px ' + FONT;
    var maxW = W - 2 * M, words = String(str).split(/\s+/).filter(Boolean), lines = [], cur = '';
    words.forEach(function (w) {
      var x = cur ? cur + ' ' + w : w;
      if (t.measureText(x).width <= maxW) { cur = x; return; }
      if (cur) { lines.push(cur); cur = ''; }
      if (t.measureText(w).width <= maxW) { cur = w; return; }
      var piece = ''; Array.from(w).forEach(function (ch) { if (t.measureText(piece + ch).width > maxW && piece) { lines.push(piece); piece = ch; } else piece += ch; }); cur = piece;
    });
    if (cur) lines.push(cur);
    var need = 0; lines.forEach(function (l) { need = Math.max(need, t.measureText(l).width); });
    var cw = align === 'center' ? W : Math.min(W, Math.ceil((need + 2 * M) / 8) * 8), ch = lines.length * lh + Math.round(4 * Sc);
    var c = makeCanvas(cw, ch), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cw, ch); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    ctx.font = 'bold ' + sz + 'px ' + FONT; ctx.textBaseline = 'alphabetic'; ctx.lineWidth = Math.max(0.7, Sc * 0.8);
    lines.forEach(function (l, i) {
      var x = align === 'center' ? cw / 2 : M; ctx.textAlign = align === 'center' ? 'center' : 'left';
      var y = (i + 1) * lh - Math.round(sz * 0.22); ctx.fillText(l, x, y); ctx.strokeText(l, x, y);
    });
    return c;
  }

  /* canvas -> ESC/POS raster block (GS v 0), fast typed arrays */
  function rasterBody(canvas) {
    var W = canvas.width, H = canvas.height;
    var data = canvas.getContext('2d').getImageData(0, 0, W, H).data, wb = Math.ceil(W / 8);
    var parts = [], BAND = 240, total = 0;
    for (var y0 = 0; y0 < H; y0 += BAND) {
      var rows = Math.min(BAND, H - y0), body = new Uint8Array(wb * rows), p = 0;
      for (var y = y0; y < y0 + rows; y++) {
        for (var xb = 0; xb < wb; xb++) {
          var byte = 0;
          for (var bit = 0; bit < 8; bit++) {
            var x = xb * 8 + bit;
            if (x < W) { var i = (y * W + x) * 4; if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 175) byte |= (0x80 >> bit); }
          }
          body[p++] = byte;
        }
      }
      var head = Uint8Array.of(0x1d, 0x76, 0x30, 0x00, wb & 255, wb >> 8, rows & 255, rows >> 8);
      parts.push(head, body); total += head.length + body.length;
    }
    var out = new Uint8Array(total), o = 0; parts.forEach(function (a) { out.set(a, o); o += a.length; });
    return out;
  }

  function buildReceipt(b, reprint) {
    var W = S.width, cols = W >= 500 ? 48 : 32, lang = S.lang, half = b.gstRate / 2, d = new Date(b.billDate);
    var chunks = [], buf = [], preview = [], cur = [];
    function raw() { for (var i = 0; i < arguments.length; i++) buf.push(arguments[i]); }
    function txt(s) { for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); buf.push(c >= 32 && c < 127 ? c : 63); } }
    function ln(s) { txt(s); buf.push(10); cur.push(s); }
    function flushBuf() { if (buf.length) { chunks.push(Uint8Array.from(buf)); buf = []; } }
    function flushPrev() { if (cur.length) { preview.push({ t: cur.join('\n') }); cur = []; } }
    function picture(canvas) { flushBuf(); flushPrev(); chunks.push(rasterBody(canvas)); preview.push({ img: canvas }); }
    function spaces(n) { return n > 0 ? new Array(n + 1).join(' ') : ''; }
    function lr(l, r) { var gap = cols - l.length - r.length; return gap >= 1 ? l + spaces(gap) + r : (l.slice(0, Math.max(0, cols - r.length - 1)) + ' ' + r); }
    function rule() { ln(new Array(cols + 1).join('-')); }
    function wrapAscii(s, w) {
      var res = [], c = '';
      String(s).split(/\s+/).forEach(function (wd) {
        if (!wd) return;
        while (wd.length > w) { if (c) { res.push(c); c = ''; } res.push(wd.slice(0, w)); wd = wd.slice(w); }
        if ((c ? c + ' ' + wd : wd).length <= w) c = c ? c + ' ' + wd : wd; else { res.push(c); c = wd; }
      });
      if (c) res.push(c); return res.length ? res : [''];
    }
    function center(s, bold, dbl) {
      raw(0x1b, 0x61, 1, 0x1b, 0x45, bold ? 1 : 0, 0x1d, 0x21, dbl ? 0x11 : 0);
      wrapAscii(s, dbl ? Math.floor(cols / 2) : cols).forEach(function (l) { ln(l); });
      raw(0x1d, 0x21, 0, 0x1b, 0x45, 0, 0x1b, 0x61, 0);
    }
    function money(n) { return fmtR(n); }

    raw(0x1b, 0x40);
    center(SHOP.name, true, true);
    center(SHOP.tag);
    center(SHOP.addr1); center(SHOP.addr2);
    center(SHOP.phone); center(SHOP.msme); center(SHOP.fssai); center(SHOP.gstin);
    rule();
    ln(lr('Bill: ' + b.billNo, dateStr(d) + ' ' + timeStr(d)));
    if (b.paymentType) ln('Bill Type : ' + (PAY[b.paymentType] || String(b.paymentType).toUpperCase()));
    if (reprint) center('*** DUPLICATE COPY ***');
    rule();

    b.items.forEach(function (it, i) {
      var nm = displayName(it, lang), label = (i + 1) + '. ' + nm;
      if (!isAscii(nm)) picture(textStrip(label, W, 'left'));
      else wrapAscii(label, cols).forEach(function (l) { ln(l); });
      ln(lr('    ' + fmtQty(it.qty) + ' x ' + money(it.rate), money(it.amount)));
    });
    rule();
    var tq = b.items.reduce(function (s, i) { return s + i.qty; }, 0);
    ln(lr('Items: ' + b.items.length, 'Qty: ' + fmtQty(tq)));
    if (b.adjustment) ln(lr(b.adjustment < 0 ? 'Discount' : 'Round off', (b.adjustment < 0 ? '-' : '+') + money(Math.abs(b.adjustment))));
    ln(lr('Taxable Value', money(b.taxable)));
    ln(lr('CGST @ ' + half + '%', money(b.cgst)));
    ln(lr('SGST @ ' + half + '%', money(b.sgst)));
    rule();
    raw(0x1b, 0x45, 1, 0x1d, 0x21, 0x01);
    var tl = lr('TOTAL', 'Rs.' + money(b.total)); ln(tl.length > cols ? 'TOTAL Rs.' + money(b.total) : tl);
    raw(0x1d, 0x21, 0, 0x1b, 0x45, 0);
    center('(Inclusive of all taxes)');
    rule();
    if (lang !== 'english') picture(textStrip('நன்றி! மீண்டும் வருக!', W, 'center'));
    center('Thank You! Visit Again!', true, false);
    raw(0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00);
    flushBuf(); flushPrev();

    var total = 0; chunks.forEach(function (c) { total += c.length; });
    var bytes = new Uint8Array(total), o = 0; chunks.forEach(function (c) { bytes.set(c, o); o += c.length; });
    return { bytes: bytes, preview: preview };
  }
  function buildPrint(b, reprint) { return buildReceipt(b, reprint); }

  /* ============================================================
     PRINTING – Bluetooth (Chrome on Android) or RawBT app
     ============================================================ */
  var BLE = { device: null, chr: null, wait: false };
  var PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb', '00001101-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb', '0000ffe5-0000-1000-8000-00805f9b34fb'
  ];
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  function findWritable(server) {
    return server.getPrimaryServices().then(function (services) {
      var chain = Promise.resolve(null);
      services.forEach(function (s) {
        chain = chain.then(function (found) {
          if (found) return found;
          return s.getCharacteristics().then(function (chars) {
            for (var i = 0; i < chars.length; i++) if (chars[i].properties.write || chars[i].properties.writeWithoutResponse) return chars[i];
            return null;
          });
        });
      });
      return chain;
    });
  }
  function withTimeout(promise, ms, tag) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error(tag)); }, ms);
      promise.then(function (v) { clearTimeout(t); res(v); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function isConnected() { return !!(BLE.chr && BLE.device && BLE.device.gatt && BLE.device.gatt.connected); }

  /* remember the printer + reconnect by itself whenever Chrome drops the link (screen off, sleep, out of range) */
  var reTimer = null, RETRY = [700, 2500, 6000, 12000];
  function hookDevice(dev) {
    if (dev.__qb) return; dev.__qb = true;
    lsSet('qb_printer_id', dev.id || '');
    dev.addEventListener('gattserverdisconnected', function () { BLE.chr = null; setPrinter(); scheduleReconnect(0); });
  }
  function scheduleReconnect(n) {
    clearTimeout(reTimer);
    if (S.method !== 'ble' || !BLE.device || n >= RETRY.length || document.hidden) { BLE.wait = false; setPrinter(); return; }
    BLE.wait = true; setPrinter();
    reTimer = setTimeout(function () {
      if (isConnected()) { BLE.wait = false; setPrinter(); return; }
      bleConnect(false).then(function () { BLE.wait = false; setPrinter(); }).catch(function () { scheduleReconnect(n + 1); });
    }, RETRY[n]);
  }
  function restorePrinter() {          // after the page/app was closed & reopened (only if this Chrome allows it)
    if (S.method !== 'ble' || !navigator.bluetooth || !navigator.bluetooth.getDevices) return;
    navigator.bluetooth.getDevices().then(function (list) {
      var id = lsGet('qb_printer_id', '');
      var d = list.filter(function (x) { return x.id === id; })[0] || (list.length === 1 ? list[0] : null);
      if (!d) return; BLE.device = d; hookDevice(d); scheduleReconnect(0);
    }).catch(function () {});
  }

  function bleConnect(forcePick) {
    if (!navigator.bluetooth) return Promise.reject(new Error('NO_BLE'));
    if (forcePick) { try { if (BLE.device && BLE.device.gatt.connected) BLE.device.gatt.disconnect(); } catch (e) {} BLE.device = null; BLE.chr = null; }
    if (isConnected()) return Promise.resolve(BLE.chr);
    var pick = BLE.device ? Promise.resolve(BLE.device) :      // choosing a printer must run straight from a tap (user gesture)
      navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES }).then(function (dev) {
        BLE.device = dev; hookDevice(dev); return dev;
      });
    return pick.then(function (dev) {
      return withTimeout(dev.gatt.connect(), 10000, 'TIMEOUT').catch(function (e) { try { dev.gatt.disconnect(); } catch (x) {} throw e; });
    }).then(findWritable).then(function (chr) {
      if (!chr) throw new Error('NO_CHAR');
      BLE.chr = chr; BLE.wait = false; setPrinter(); return chr;
    });
  }
  function bleWrite(chr, bytes, size, gap) {
    var i = 0;
    function next() {
      if (i >= bytes.length) return Promise.resolve();
      var part = bytes.slice(i, i + size); i += size;
      var w = (chr.properties.writeWithoutResponse && chr.writeValueWithoutResponse) ? chr.writeValueWithoutResponse(part) : chr.writeValue(part);
      return w.then(function () { return sleep(gap); }).then(next);
    }
    return next();
  }
  function setPrinter() {
    var ok = BLE.device && BLE.device.gatt && BLE.device.gatt.connected;
    $('prn').className = 'pill ' + (ok ? 'ok' : (BLE.wait ? 'wait' : ''));
    $('prn').textContent = ok ? '🖨 ' + (BLE.device.name || 'Printer') : (BLE.wait ? '🖨 Reconnecting…' : (BLE.device ? '🖨 Tap to reconnect' : '🖨 Connect'));
  }

  /* returns a promise: resolves when the bytes have gone to the printer */
  function sendBytes(bytes, forcePick) {
    if (S.method === 'rawbt') return Promise.resolve(sendRawBT(bytes));
    var sp = SPEEDS[S.speed] || SPEEDS.normal;
    return bleConnect(forcePick)
      .then(function (chr) { return bleWrite(chr, bytes, sp[0], sp[1]).catch(function () { return bleConnect(false).then(function (c2) { return bleWrite(c2, bytes, 100, 18); }); }); });
  }
  function sendRawBT(bytes) {
    var bin = '', CH = 8192;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    var a = document.createElement('a'); a.href = 'rawbt:base64,' + btoa(bin);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  }
  function printError(e) {
    BLE.chr = null; setPrinter();
    if (e && e.name === 'NotFoundError') return toast('No printer selected', true);
    if (e && e.message === 'NO_BLE') return toast('Bluetooth not supported here. Open in Chrome on Android, or switch to RawBT in ⚙ Settings.', true);
    if (e && e.message === 'TIMEOUT') return toast('Printer not responding. Check it is switched ON and close to the phone, then tap PRINT again.', true);
    if (e && e.message === 'NO_CHAR') return toast('This printer cannot be used from the browser. Switch to RawBT in ⚙ Settings.', true);
    console.error(e); toast('Could not print: ' + (e && e.message ? e.message : e), true);
  }

  /* ============================================================
     SAVE (background) – recent list + offline queue
     ============================================================ */
  function commitBill(b) {
    lsSet('qb_seq', String(b._no)); delete b._no;
    var recent = jget('qb_recent', []); recent.unshift(b); jset('qb_recent', recent.slice(0, 60));
    var q = jget('qb_queue', []); q.push(b); jset('qb_queue', q);
    updateBadge(); sync();
  }
  var syncing = false;
  function pending() { return jget('qb_queue', []).length + jget('qb_delq', []).length; }
  function sync() {
    if (syncing) return;
    var tok = lsGet('vbs_atoken', '');
    if (!pending()) { updateBadge(); return; }
    if (!tok) { needLogin = true; updateBadge(); return; }
    syncing = true;
    function done() { syncing = false; updateBadge(); }
    function authFail() { lsDel('vbs_atoken'); needLogin = true; throw new Error('auth'); }
    function stepDel() {
      var dq = jget('qb_delq', []);
      if (!dq.length) return done();
      fetch(API + '/bills/by-client/' + encodeURIComponent(dq[0]), { method: 'DELETE', headers: { Authorization: 'Bearer ' + tok } })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) authFail();
          if (!r.ok) throw new Error('server');
          dq.shift(); jset('qb_delq', dq); stepDel();
        }).catch(done);
    }
    function step() {
      var q = jget('qb_queue', []);
      if (!q.length) return stepDel();
      fetch(API + '/bills', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(q[0]) })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) authFail();
          if (r.status === 400) { var f = jget('qb_failed', []); f.push(q[0]); jset('qb_failed', f); }   // keep a copy, never lose a bill
          else if (!r.ok) throw new Error('server');
          q.shift(); jset('qb_queue', q); setNet(true); step();
        }).catch(done);
    }
    step();
  }
  function updateBadge() {
    var n = pending(), b = $('sync');
    if (!n) { b.style.display = 'none'; return; }
    b.style.display = 'inline-block';
    b.textContent = needLogin ? '⚠ Login to save ' + n : '☁ ' + n + ' waiting';
  }
  function refreshSeq() {
    var tok = lsGet('vbs_atoken', ''); if (!tok) return;
    fetch(API + '/bills/next-number?prefix=' + encodeURIComponent(S.prefix), { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d.success && d.last > (parseInt(lsGet('qb_seq', '0'), 10) || 0)) lsSet('qb_seq', String(d.last)); })
      .catch(function () {});
  }

  /* ============================================================
     ACTIONS
     ============================================================ */
  /* keep the screen awake while Quick Bill is open, so Bluetooth is not cut when the phone sleeps */
  var wake = null;
  function keepAwake() {
    if (!S.awake || !navigator.wakeLock || wake || document.hidden) return;
    navigator.wakeLock.request('screen').then(function (l) { wake = l; l.addEventListener('release', function () { wake = null; }); }).catch(function () {});
  }
  function releaseAwake() { if (wake) { try { wake.release(); } catch (e) {} wake = null; } }

  var printing = false;
  function printNow() {
    if (printing || !cart.length) return;
    var bad = cart.filter(function (l) { return !(Number(l.qty) > 0) || !(Number(l.rate) >= 0); });
    if (bad.length) return toast('Check quantity / price of: ' + bad[0].en, true);
    printing = true; $('printBtn').disabled = true; $('printBtn').textContent = 'Printing…';
    var b = makeBill(), job;
    try { job = buildPrint(b, false); } catch (e) { printing = false; resetPrintBtn(); return toast('Could not build bill: ' + e.message, true); }
    sendBytes(job.bytes, false).then(function () {
      commitBill(b); clearCart(); $('sheet').classList.remove('open'); toast('✅ Printed ' + b.billNo);
    }).catch(printError).then(function () { printing = false; resetPrintBtn(); });
  }
  function resetPrintBtn() { $('printBtn').textContent = '🖨 PRINT'; $('printBtn').disabled = !cart.length; }

  function showPreview(b, reprintFn) {
    var job = buildPrint(b, !!reprintFn), box = $('pvBody');
    box.innerHTML = '';
    var sheet = document.createElement('div'); sheet.className = 'pvsheet';
    job.preview.forEach(function (p) {
      if (p.t != null) { var pre = document.createElement('pre'); pre.className = 'pvtxt'; pre.textContent = p.t; sheet.appendChild(pre); }
      else { var img = new Image(); img.src = p.img.toDataURL('image/png'); img.style.width = (p.img.width / S.width * 100) + '%'; img.className = 'pvimg'; sheet.appendChild(img); }
    });
    box.appendChild(sheet);
    var kb = document.createElement('div'); kb.className = 'hint'; kb.textContent = 'Data sent to printer: ' + (job.bytes.length / 1024).toFixed(1) + ' KB'; box.appendChild(kb);
    $('pvPrint').onclick = function () {
      $('pvPrint').disabled = true;
      sendBytes(job.bytes, false).then(function () {
        if (!reprintFn) { commitBill(b); clearCart(); $('sheet').classList.remove('open'); }
        closeModal('pv'); toast('✅ Printed ' + b.billNo);
      }).catch(printError).then(function () { $('pvPrint').disabled = false; });
    };
    openModal('pv');
  }

  /* ---------- modals ---------- */
  function openModal(id) { $(id).classList.add('open'); }
  function closeModal(id) { $(id).classList.remove('open'); }

  /* ---------- edit bill names ---------- */
  var editing = null;
  function openEdit(id) {
    var p = products.filter(function (x) { return x.id === id; })[0]; if (!p) return;
    editing = p;
    $('edFull').textContent = p.name; $('edShort').value = p.short; $('edTa').value = p.ta;
    openModal('ed'); setTimeout(function () { $('edShort').focus(); }, 120);
  }
  function saveEdit() {
    var tok = lsGet('vbs_atoken', '');
    if (!tok) { closeModal('ed'); openModal('lg'); return toast('Login first to save names', true); }
    var short = $('edShort').value.trim(), ta = $('edTa').value.trim();
    $('edSave').disabled = true;
    fetch(API + '/products/' + editing.id, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify({ shortName: short, tamilName: ta }) })
      .then(function (r) { if (r.status === 401 || r.status === 403) { lsDel('vbs_atoken'); needLogin = true; throw new Error('Login expired – login again'); } return r.json(); })
      .then(function (d) {
        if (!d.success) throw new Error(d.message || 'Failed');
        editing.short = short; editing.ta = ta; jset('qb_products', products);
        cart.forEach(function (l) { if (l.pid === editing.id) { l.en = enName(editing); l.ta = ta; } });
        renderGrid(); renderCart(); closeModal('ed'); toast('Saved');
      })
      .catch(function (e) { toast(e.message || 'Could not save', true); })
      .then(function () { $('edSave').disabled = false; });
  }

  /* ---------- login ---------- */
  function doLogin() {
    var u = $('lgUser').value.trim(), p = $('lgPass').value;
    if (!u || !p) return toast('Enter username and password', true);
    $('lgBtn').disabled = true;
    fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: u, password: p }) })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (!d.success) throw new Error(d.message || 'Login failed');
        lsSet('vbs_atoken', d.token); needLogin = false; $('lgPass').value = '';
        closeModal('lg'); toast('Logged in'); refreshSeq(); sync();
      })
      .catch(function (e) { toast(e.message, true); })
      .then(function () { $('lgBtn').disabled = false; });
  }

  /* ---------- recent bills ---------- */
  var hist = [], histLive = false;
  function mergeHistory(serverBills) {
    var delq = jget('qb_delq', []), seen = {}, out = [];
    jget('qb_queue', []).forEach(function (b) { seen[b.clientId] = 1; out.push(b); });          // printed here, not saved yet
    serverBills.forEach(function (b) { if (!seen[b.clientId] && delq.indexOf(b.clientId) < 0) { seen[b.clientId] = 1; out.push(b); } });
    out.sort(function (a, b) { return new Date(b.billDate) - new Date(a.billDate); });
    return out;
  }
  function renderHistory(list, live) {
    hist = list; histLive = live;
    var today = dateStr(new Date()), sum = { cash: 0, upi: 0, card: 0, all: 0 }, cnt = 0;
    list.forEach(function (b) {
      if (dateStr(new Date(b.billDate)) === today) { cnt++; sum.all += b.total; var k = b.paymentType || 'cash'; sum[k] = (sum[k] || 0) + b.total; }
    });
    $('rcSum').innerHTML = (live ? '☁ <b>All devices</b> (common database)' : '📱 <b>This phone only</b> – login &amp; go online to see all devices') +
      '<br>Today: <b>' + cnt + ' bills · ₹' + fmtR(sum.all) + '</b><br>Cash ₹' + fmtR(sum.cash) + ' · UPI ₹' + fmtR(sum.upi) + ' · Card ₹' + fmtR(sum.card);
    $('rcList').innerHTML = list.length ? list.slice(0, 150).map(function (b, i) {
      var d = new Date(b.billDate);
      return '<div class="rc"><div class="rc-l" data-view="' + i + '"><b>' + esc(b.billNo) + '</b> <span class="tag">' + esc(PAY[b.paymentType] || 'CASH') + '</span><div class="hint">' + dateStr(d) + ' ' + timeStr(d) + ' · ' + b.items.length + ' items · tap to view</div></div>' +
        '<div class="rc-r"><b>₹' + fmtR(b.total) + '</b><span class="rcb"><button class="mini grn" data-view="' + i + '">👁 View</button><button class="mini" data-re="' + i + '">Reprint</button><button class="mini red" data-del="' + i + '">🗑 Delete</button></span></div></div>';
    }).join('') : '<div class="empty">No bills yet</div>';
  }
  function openRecent() {
    renderHistory(jget('qb_recent', []), false);
    openModal('rc');
    var tok = lsGet('vbs_atoken', ''); if (!tok) { needLogin = true; return; }
    fetch(API + '/bills?limit=300', { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) { if (r.status === 401 || r.status === 403) { lsDel('vbs_atoken'); needLogin = true; updateBadge(); throw new Error('auth'); } return r.json(); })
      .then(function (d) {
        if (!d.success) return;
        var m = mergeHistory(d.bills); jset('qb_recent', m.slice(0, 300)); renderHistory(m, true); setNet(true);
      }).catch(function () {});
  }
  /* ---------- view one bill (for writing in the manual note / quick checking) ---------- */
  var viewIdx = -1;
  function billText(b) {
    var d = new Date(b.billDate), half = b.gstRate / 2, L = [];
    L.push(b.billNo + '  ' + dateStr(d) + ' ' + timeStr(d) + '  ' + (PAY[b.paymentType] || 'CASH'));
    b.items.forEach(function (i, n) { L.push((n + 1) + '. ' + (i.name || '') + (i.tamilName ? ' (' + i.tamilName + ')' : '') + '  ' + fmtQty(i.qty) + ' x ' + fmtR(i.rate) + ' = ' + fmtR(i.amount)); });
    if (b.adjustment) L.push((b.adjustment < 0 ? 'Discount -' : 'Round off +') + fmtR(Math.abs(b.adjustment)));
    L.push('Taxable ' + fmtR(b.taxable) + ' | CGST ' + half + '% ' + fmtR(b.cgst) + ' | SGST ' + half + '% ' + fmtR(b.sgst));
    L.push('TOTAL Rs.' + fmtR(b.total));
    return L.join('\n');
  }
  function viewBill(i) {
    var b = hist[i]; if (!b) return; viewIdx = i;
    var d = new Date(b.billDate), half = b.gstRate / 2, qty = 0;
    var rows = b.items.map(function (it, n) {
      qty += Number(it.qty) || 0;
      return '<tr><td class="vn">' + (n + 1) + '</td><td><b>' + esc(it.name) + '</b>' + (it.tamilName ? '<div class="hint">' + esc(it.tamilName) + '</div>' : '') +
        '<div class="hint">' + fmtQty(it.qty) + ' × ₹' + fmtR(it.rate) + '</div></td><td class="vr"><b>₹' + fmtR(it.amount) + '</b></td></tr>';
    }).join('');
    $('vwBody').innerHTML =
      '<div class="vh"><b style="font-size:1.15rem">' + esc(b.billNo) + '</b> <span class="tag">' + esc(PAY[b.paymentType] || 'CASH') + '</span>' +
      '<div class="hint">' + dateStr(d) + ' · ' + timeStr(d) + '</div></div>' +
      '<table class="vt">' + rows + '</table>' +
      '<div class="vs"><div><span>Items / Qty</span><span>' + b.items.length + ' / ' + fmtQty(qty) + '</span></div>' +
      (b.adjustment ? '<div><span>' + (b.adjustment < 0 ? 'Discount' : 'Round off') + '</span><span>' + (b.adjustment < 0 ? '−' : '+') + '₹' + fmtR(Math.abs(b.adjustment)) + '</span></div>' : '') +
      '<div><span>Taxable value</span><span>₹' + fmtR(b.taxable) + '</span></div>' +
      '<div><span>CGST ' + half + '%</span><span>₹' + fmtR(b.cgst) + '</span></div>' +
      '<div><span>SGST ' + half + '%</span><span>₹' + fmtR(b.sgst) + '</span></div>' +
      '<div class="vtot"><span>TOTAL</span><span>₹' + fmtR(b.total) + '</span></div></div>';
    openModal('vw');
  }
  function copyBill() {
    var b = hist[viewIdx]; if (!b) return; var t = billText(b);
    function ok() { toast('Copied – paste it in any note'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok).catch(function () { toast('Could not copy', true); });
    else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) { toast('Could not copy', true); } document.body.removeChild(ta); }
  }

  function deleteBill(i) {
    var b = hist[i]; if (!b) return;
    if (!confirm('Delete bill ' + b.billNo + ' (₹' + fmtR(b.total) + ')?\nIt will be removed from history and from your sales records on ALL devices.')) return;
    hist.splice(i, 1); jset('qb_recent', hist.slice(0, 300));
    jset('qb_queue', jget('qb_queue', []).filter(function (x) { return x.clientId !== b.clientId; }));
    var dq = jget('qb_delq', []); dq.push(b.clientId); jset('qb_delq', dq);    // removes it from the common database (now or when online)
    updateBadge(); sync(); renderHistory(hist, histLive); toast('Deleted ' + b.billNo);
  }

  /* ---------- settings ---------- */
  function openSettings() {
    $('sWidth').value = S.width; $('sLang').value = S.lang; $('sMethod').value = S.method; $('sSpeed').value = S.speed;
    $('sGst').value = S.gst; $('sPrefix').value = S.prefix; $('sAwake').checked = !!S.awake;
    var cats = []; products.forEach(function (p) { if (cats.indexOf(p.cat) < 0) cats.push(p.cat); });
    $('sCats').innerHTML = cats.length ? cats.map(function (c) {
      return '<label class="chk2"><input type="checkbox" data-sc="' + esc(c) + '"' + (isHidden(c) ? '' : ' checked') + '> ' + esc(capital(c)) + '</label>';
    }).join('') : '<span class="hint">Products not loaded yet</span>';
    openModal('st');
  }
  function bindSettings() {
    $('sWidth').onchange = function () { S.width = parseInt(this.value, 10); saveSettings(); };
    $('sLang').onchange = function () { S.lang = this.value; saveSettings(); };
    $('sMethod').onchange = function () { S.method = this.value; saveSettings(); };
    $('sSpeed').onchange = function () { S.speed = this.value; saveSettings(); };
    $('sAwake').onchange = function () { S.awake = this.checked; saveSettings(); if (S.awake) keepAwake(); else releaseAwake(); };
    $('sGst').onchange = function () { var v = parseFloat(this.value); if (isFinite(v) && v >= 0 && v < 100) { S.gst = v; saveSettings(); updateTotals(); } else this.value = S.gst; };
    $('sPrefix').onchange = function () { var v = this.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'B'; this.value = v; S.prefix = v; saveSettings(); lsSet('qb_seq', '0'); refreshSeq(); };
    $('sCats').addEventListener('change', function (e) {
      var c = e.target.dataset.sc; if (!c) return;
      var h = (S.hidden || []).filter(function (x) { return x !== c.toLowerCase(); });
      if (!e.target.checked) h.push(c.toLowerCase());
      S.hidden = h; saveSettings(); renderCats(); renderGrid();
    });
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function init() {
    bindSettings(); renderCart(); setPrinter(); updateBadge();

    $('cats').addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; renderCats(); renderGrid(); });
    $('q').addEventListener('input', function () { query = this.value; renderGrid(); });
    $('grid').addEventListener('click', function (e) {
      var dec = e.target.closest('[data-dec]'); if (dec) { e.stopPropagation(); return decProduct(dec.dataset.dec); }
      var ed = e.target.closest('[data-edit]'); if (ed) { e.stopPropagation(); return openEdit(ed.dataset.edit); }
      var t = e.target.closest('.tile'); if (!t) return;
      var p = products.filter(function (x) { return x.id === t.dataset.id; })[0]; if (p) addProduct(p);
    });

    $('grid').addEventListener('error', function (e) { if (e.target.tagName === 'IMG') e.target.parentNode.classList.add('noimg'); }, true);
    $('pay').addEventListener('click', function (e) { var b = e.target.closest('[data-pay]'); if (b) setPay(b.dataset.pay); });
    $('lines').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      var i = parseInt(b.closest('.ln').dataset.i, 10), l = cart[i], a = b.dataset.act;
      if (a === 'del') cart.splice(i, 1);
      else if (a === 'inc') l.qty = Math.round((Number(l.qty) + 1) * 1000) / 1000;
      else if (a === 'dec') { l.qty = Math.round((Number(l.qty) - 1) * 1000) / 1000; if (l.qty <= 0) cart.splice(i, 1); }
      renderCart();
    });
    $('lines').addEventListener('input', function (e) {
      var f = e.target.dataset.f; if (!f) return;
      var i = parseInt(e.target.closest('.ln').dataset.i, 10); cart[i][f] = e.target.value === '' ? 0 : parseFloat(e.target.value);
      updateTotals();
    });
    $('finalTotal').addEventListener('input', updateTotals);

    $('dockInfo').onclick = function () { $('sheet').classList.toggle('open'); };
    $('closeSheet').onclick = function () { $('sheet').classList.remove('open'); };
    $('printBtn').onclick = printNow;
    $('previewBtn').onclick = function () { if (cart.length) showPreview(makeBill(), null); };
    $('clearBtn').onclick = function () { if (cart.length && confirm('Clear this bill?')) clearCart(); };
    $('customBtn').onclick = addCustom;

    $('prn').onclick = function () {
      if (S.method === 'rawbt') return toast('Using RawBT – set printer inside the RawBT app');
      if (isConnected()) return toast('Printer is connected ✔');
      if (BLE.device) {                       // known printer: reconnect quietly first
        BLE.wait = true; setPrinter();
        return bleConnect(false).then(function () { toast('Printer reconnected'); })
          .catch(function () { BLE.wait = false; BLE.device = null; setPrinter(); toast('Could not reach printer. Switch it on, then tap again to choose it.', true); });
      }
      bleConnect(true).then(function () { toast('Printer connected'); }).catch(printError);
    };
    $('sync').onclick = function () { if (needLogin || !lsGet('vbs_atoken', '')) openModal('lg'); else sync(); };
    $('recentBtn').onclick = openRecent;
    $('setBtn').onclick = openSettings;
    $('rcList').addEventListener('click', function (e) {
      var vw = e.target.closest('[data-view]'); if (vw && !e.target.closest('[data-del],[data-re]')) return viewBill(parseInt(vw.dataset.view, 10));
      var del = e.target.closest('[data-del]'); if (del) return deleteBill(parseInt(del.dataset.del, 10));
      var b = e.target.closest('[data-re]'); if (!b) return;
      var bill = hist[parseInt(b.dataset.re, 10)]; if (bill) { closeModal('rc'); showPreview(bill, true); }
    });
    document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { closeModal(b.dataset.close); }; });
    $('vwCopy').onclick = copyBill;
    $('vwReprint').onclick = function () { var b = hist[viewIdx]; if (b) { closeModal('vw'); closeModal('rc'); showPreview(b, true); } };
    $('vwDel').onclick = function () { var i = viewIdx; closeModal('vw'); deleteBill(i); };
    $('edSave').onclick = saveEdit; $('lgBtn').onclick = doLogin;
    $('lgPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('lgSkip').onclick = function () { closeModal('lg'); };

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { refreshSeq(); sync(); keepAwake(); if (S.method === 'ble' && BLE.device && !isConnected()) scheduleReconnect(0); }
    });
    document.addEventListener('pointerdown', function () { if (!wake) keepAwake(); }, { passive: true });
    window.addEventListener('online', function () { setNet(true); sync(); loadProducts(); });
    window.addEventListener('offline', function () { setNet(false); });

    keepAwake(); restorePrinter();
    loadProducts();
    if (!lsGet('vbs_atoken', '')) { needLogin = true; openModal('lg'); } else { refreshSeq(); sync(); }

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
  }

  window.QB = { splitGst: splitGst, computeBill: computeBill };   // exposed for testing
  if (typeof document !== 'undefined' && document.getElementById('grid')) init();
})();
