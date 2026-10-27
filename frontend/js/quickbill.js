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
    gstin: 'GSTIN: 33FCHPS4318R1ZW'
  };

  var DEFAULTS = { width: 576, lang: 'both', method: 'ble', speed: 'normal', addr: false, gst: 5, prefix: 'B' };
  var SPEEDS = { fast: [240, 4], normal: [180, 10], safe: [100, 18] };   // [bytes per write, ms pause]
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
    return { id: p._id, name: p.name, short: p.shortName || '', ta: p.tamilName || '', price: p.price, cat: p.category || 'other', unit: p.unit || '' };
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
  function renderCats() {
    var cats = ['all'];
    products.forEach(function (p) { if (cats.indexOf(p.cat) < 0) cats.push(p.cat); });
    $('cats').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (c === cat ? ' on' : '') + '" data-cat="' + esc(c) + '">' + (c === 'all' ? 'All' : esc(c.charAt(0).toUpperCase() + c.slice(1))) + '</button>';
    }).join('');
  }
  function renderGrid() {
    var q = query.trim().toLowerCase();
    var list = products.filter(function (p) {
      if (cat !== 'all' && p.cat !== cat) return false;
      if (!q) return true;
      return (p.name + ' ' + p.short + ' ' + p.ta).toLowerCase().indexOf(q) >= 0;
    });
    if (!list.length) { $('grid').innerHTML = '<div class="empty">No products found</div>'; return; }
    $('grid').innerHTML = list.map(function (p) {
      var missing = !p.ta;
      return '<div class="tile" data-id="' + esc(p.id) + '">' +
        '<button class="edit' + (missing ? ' warn' : '') + '" data-edit="' + esc(p.id) + '" title="Edit bill names">✏️</button>' +
        '<div class="tn">' + esc(enName(p)) + '</div>' +
        (p.ta ? '<div class="tt">' + esc(p.ta) + '</div>' : '') +
        '<div class="tp">₹' + fmtR(p.price) + '</div></div>';
    }).join('');
  }

  /* ============================================================
     CART
     ============================================================ */
  function addProduct(p) {
    var hit = cart.filter(function (l) { return l.pid === p.id && l.rate === p.price; })[0];
    if (hit) hit.qty = Math.round((hit.qty + 1) * 1000) / 1000;
    else cart.push({ pid: p.id, en: enName(p), ta: p.ta, rate: p.price, qty: 1 });
    renderCart();
    if (navigator.vibrate) try { navigator.vibrate(15); } catch (e) {}
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
  }
  function clearCart() { cart = []; $('finalTotal').value = ''; renderCart(); }

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
      itemsTotal: b.sum / 100, adjustment: b.adj / 100, gstRate: S.gst,
      taxable: b.taxable / 100, cgst: b.cgst / 100, sgst: b.sgst / 100, total: b.total / 100,
      _no: no
    };
  }

  /* ============================================================
     RECEIPT – picture version (Tamil + English)
     ============================================================ */
  function displayName(it, lang) {
    if (lang === 'tamil') return it.tamilName || it.name;
    if (lang === 'english') return it.name;
    return it.tamilName ? it.tamilName + ' / ' + it.name : it.name;
  }
  function dateStr(d) { return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear(); }
  function timeStr(d) { var h = d.getHours(), ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return pad2(h) + ':' + pad2(d.getMinutes()) + ' ' + ap; }

  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function renderCanvas(b, W, lang, showAddr, reprint) {
    var Sc = W / 576, M = Math.round(10 * Sc);
    function px(n) { return Math.round(n * Sc); }
    var d = new Date(b.billDate), half = b.gstRate / 2;
    var showRate = W >= 500;
    var xNo = M, xName = M + px(34);
    var xQty = Math.round(W * (showRate ? 0.60 : 0.68)), xRate = Math.round(W * 0.79), xAmt = W - M;
    var nameW = xQty - px(56) - xName;
    var totQty = b.items.reduce(function (s, i) { return s + i.qty; }, 0);

    function pass(ctx, draw) {
      var y = px(6);
      function font(sz) { ctx.font = 'bold ' + px(sz) + 'px ' + FONT; }
      function put(t, x, yy, al) {
        if (!draw) return;
        ctx.textAlign = al || 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(t, x, yy); ctx.lineWidth = Math.max(0.7, Sc * 0.8); ctx.strokeText(t, x, yy);
      }
      function wrap(str, maxW) {
        var words = String(str == null ? '' : str).split(/\s+/).filter(Boolean), lines = [], cur = '';
        words.forEach(function (w) {
          var t = cur ? cur + ' ' + w : w;
          if (ctx.measureText(t).width <= maxW) { cur = t; return; }
          if (cur) { lines.push(cur); cur = ''; }
          if (ctx.measureText(w).width <= maxW) { cur = w; return; }
          var piece = ''; Array.from(w).forEach(function (ch) {
            if (ctx.measureText(piece + ch).width > maxW && piece) { lines.push(piece); piece = ch; } else piece += ch;
          }); cur = piece;
        });
        if (cur) lines.push(cur);
        return lines.length ? lines : [''];
      }
      function line(t, sz, al) {
        font(sz); var lh = px(sz * 1.22);
        wrap(t, W - 2 * M).forEach(function (l) { y += lh; put(l, al === 'center' ? W / 2 : al === 'right' ? W - M : M, y - px(sz * 0.2), al || 'left'); });
      }
      function pair(l, r, sz) {
        font(sz); var lh = px(sz * 1.22);
        y += lh; put(l, M, y - px(sz * 0.2), 'left');
        if (ctx.measureText(l).width + ctx.measureText(r).width + px(14) > W - 2 * M) y += lh;   // too long for one line (58 mm) -> amount drops to the next line
        put(r, W - M, y - px(sz * 0.2), 'right');
      }
      function dash() {
        y += px(3);
        if (draw) { ctx.save(); ctx.setLineDash([px(6), px(4)]); ctx.lineWidth = Math.max(1.5, px(2)); ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(W - M, y); ctx.stroke(); ctx.restore(); }
        y += px(5);
      }

      /* header (kept short on purpose: less paper = faster print) */
      line(SHOP.name, 38, 'center');
      line(SHOP.tag, 21, 'center');
      if (showAddr) { line(SHOP.addr1, 20, 'center'); line(SHOP.addr2, 20, 'center'); }
      line(SHOP.phone, 21, 'center');
      line(SHOP.gstin, 21, 'center');
      dash();
      pair('Bill / பில்: ' + b.billNo, dateStr(d) + '  ' + timeStr(d), 22);
      if (reprint) line('*** DUPLICATE COPY ***', 20, 'center');
      dash();

      /* table header */
      font(21); y += px(26);
      put('No', xNo, y - px(5), 'left'); put('Item / பொருள்', xName, y - px(5), 'left');
      put('Qty', xQty, y - px(5), 'right');
      if (showRate) put('Rate', xRate, y - px(5), 'right');
      put('Amount', xAmt, y - px(5), 'right');
      dash();

      /* items */
      b.items.forEach(function (it, i) {
        font(25); var lh = px(25 * 1.22);
        wrap(displayName(it, lang), nameW).forEach(function (l, k) {
          y += lh; put(l, xName, y - px(5), 'left');
          if (k === 0) {
            put(String(i + 1), xNo, y - px(5), 'left');
            put(fmtQty(it.qty), xQty, y - px(5), 'right');
            if (showRate) put(fmtR(it.rate), xRate, y - px(5), 'right');
            put(fmtR(it.amount), xAmt, y - px(5), 'right');
          }
        });
        y += px(3);
      });
      dash();
      pair('Items: ' + b.items.length, 'Qty: ' + fmtQty(totQty), 22);
      if (b.adjustment) pair(b.adjustment < 0 ? 'Discount :' : 'Round off :', (b.adjustment < 0 ? '- ' : '+ ') + fmtR(Math.abs(b.adjustment)), 23);

      /* GST taken out of the total */
      dash();
      pair('Taxable Value :', fmtR(b.taxable), 24);
      pair('CGST @ ' + half + '% :', fmtR(b.cgst), 24);
      pair('SGST @ ' + half + '% :', fmtR(b.sgst), 24);
      dash();
      font(36); y += px(48);
      put('TOTAL / மொத்தம்', M, y - px(10), 'left');
      y += 0;
      font(40); put('₹' + fmtR(b.total), W - M, y - px(10), 'right');
      line('(Inclusive of all taxes)', 19, 'center');
      dash();
      line('நன்றி! மீண்டும் வருக!', 25, 'center');
      line('Thank You! Visit Again!', 21, 'center');
      y += px(14);
      return y;
    }

    var probe = makeCanvas(W, 10), H = pass(probe.getContext('2d'), false);
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    pass(ctx, true);
    return c;
  }

  /* canvas -> ESC/POS raster bytes (typed arrays: fast) */
  function rasterBytes(canvas) {
    var W = canvas.width, H = canvas.height;
    var data = canvas.getContext('2d').getImageData(0, 0, W, H).data, wb = Math.ceil(W / 8);
    var parts = [Uint8Array.of(0x1b, 0x40)], BAND = 240, total = 2;
    for (var y0 = 0; y0 < H; y0 += BAND) {
      var rows = Math.min(BAND, H - y0), body = new Uint8Array(wb * rows), p = 0;
      for (var y = y0; y < y0 + rows; y++) {
        for (var xb = 0; xb < wb; xb++) {
          var byte = 0;
          for (var bit = 0; bit < 8; bit++) {
            var x = xb * 8 + bit;
            if (x < W) {
              var i = (y * W + x) * 4;
              if (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2] < 175) byte |= (0x80 >> bit);
            }
          }
          body[p++] = byte;
        }
      }
      var head = Uint8Array.of(0x1d, 0x76, 0x30, 0x00, wb & 255, wb >> 8, rows & 255, rows >> 8);
      parts.push(head, body); total += head.length + body.length;
    }
    var tail = Uint8Array.of(0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00);   // feed 3 lines + partial cut
    parts.push(tail); total += tail.length;
    var out = new Uint8Array(total), o = 0;
    parts.forEach(function (a) { out.set(a, o); o += a.length; });
    return out;
  }

  /* ============================================================
     RECEIPT – native text version (English only = FASTEST)
     The printer prints its own built-in font, so almost no data is sent.
     ============================================================ */
  function isAscii(s) { return /^[\x20-\x7e]*$/.test(s || ''); }
  function buildText(b, cols, showAddr, reprint) {
    var out = [], plain = [], half = b.gstRate / 2, d = new Date(b.billDate);
    function raw() { for (var i = 0; i < arguments.length; i++) out.push(arguments[i]); }
    function txt(s) { for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); out.push(c >= 32 && c < 127 ? c : 63); } }
    function ln(s) { txt(s); out.push(10); plain.push(s); }
    function spaces(n) { return n > 0 ? new Array(n + 1).join(' ') : ''; }
    function lr(l, r) { var gap = cols - l.length - r.length; return gap >= 1 ? l + spaces(gap) + r : (l.slice(0, Math.max(0, cols - r.length - 1)) + ' ' + r); }
    function rule() { ln(new Array(cols + 1).join('-')); }
    function center(s, bold, dbl) { raw(0x1b, 0x61, 1, 0x1b, 0x45, bold ? 1 : 0, 0x1d, 0x21, dbl ? 0x11 : 0); ln(s); raw(0x1d, 0x21, 0, 0x1b, 0x45, 0, 0x1b, 0x61, 0); }
    function wrapAscii(s, w) { var res = [], cur = ''; String(s).split(/\s+/).forEach(function (wd) { if (!wd) return; while (wd.length > w) { if (cur) { res.push(cur); cur = ''; } res.push(wd.slice(0, w)); wd = wd.slice(w); } if ((cur ? cur + ' ' + wd : wd).length <= w) cur = cur ? cur + ' ' + wd : wd; else { res.push(cur); cur = wd; } }); if (cur) res.push(cur); return res.length ? res : ['']; }
    function money(n) { return fmtR(n); }

    raw(0x1b, 0x40);
    center(SHOP.name, true, cols >= 40);
    center(SHOP.tag, false, false);
    if (showAddr) { center(SHOP.addr1); center(SHOP.addr2); }
    center(SHOP.phone); center(SHOP.gstin);
    rule();
    ln(lr('Bill: ' + b.billNo, dateStr(d) + ' ' + timeStr(d)));
    if (reprint) center('*** DUPLICATE COPY ***');
    rule();
    b.items.forEach(function (it, i) {
      var lines = wrapAscii((i + 1) + '. ' + it.name, cols);
      lines.forEach(function (l) { ln(l); });
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
    raw(0x1b, 0x45, 1, 0x1d, 0x21, 0x01);                      // bold, double height
    var tl = lr('TOTAL', 'Rs.' + money(b.total)); ln(tl.length > cols ? 'TOTAL Rs.' + money(b.total) : tl);
    raw(0x1d, 0x21, 0, 0x1b, 0x45, 0);
    center('(Inclusive of all taxes)');
    rule();
    center('Thank You! Visit Again!', true, false);
    raw(0x1b, 0x64, 0x03, 0x1d, 0x56, 0x42, 0x00);
    return { bytes: Uint8Array.from(out), plain: plain.join('\n') };
  }

  /* choose how to print this bill */
  function useTextMode(b) {
    return S.lang === 'english' && b.items.every(function (i) { return isAscii(i.name); });
  }
  function buildPrint(b, reprint) {
    if (useTextMode(b)) {
      var t = buildText(b, S.width >= 500 ? 48 : 32, S.addr, reprint);
      return { bytes: t.bytes, text: t.plain };
    }
    var c = renderCanvas(b, S.width, S.lang, S.addr, reprint);
    return { bytes: rasterBytes(c), canvas: c };
  }

  /* ============================================================
     PRINTING – Bluetooth (Chrome on Android) or RawBT app
     ============================================================ */
  var BLE = { device: null, chr: null };
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
  function bleConnect(forcePick) {
    if (!navigator.bluetooth) return Promise.reject(new Error('NO_BLE'));
    if (forcePick) { try { if (BLE.device && BLE.device.gatt.connected) BLE.device.gatt.disconnect(); } catch (e) {} BLE.device = null; BLE.chr = null; }
    if (BLE.chr && BLE.device && BLE.device.gatt.connected) return Promise.resolve(BLE.chr);
    var pick = BLE.device ? Promise.resolve(BLE.device) :      // must run straight from the tap (user gesture)
      navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES }).then(function (dev) {
        BLE.device = dev; dev.addEventListener('gattserverdisconnected', function () { BLE.chr = null; setPrinter(); });
        return dev;
      });
    return pick.then(function (dev) { return dev.gatt.connect(); }).then(findWritable).then(function (chr) {
      if (!chr) throw new Error('NO_CHAR');
      BLE.chr = chr; setPrinter(); return chr;
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
    $('prn').className = 'pill ' + (ok ? 'ok' : '');
    $('prn').textContent = ok ? '🖨 ' + (BLE.device.name || 'Printer') : '🖨 Connect';
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
  function sync() {
    if (syncing) return;
    var tok = lsGet('vbs_atoken', '');
    if (!jget('qb_queue', []).length) { updateBadge(); return; }
    if (!tok) { needLogin = true; updateBadge(); return; }
    syncing = true;
    (function step() {
      var q = jget('qb_queue', []);
      if (!q.length) { syncing = false; updateBadge(); return; }
      fetch(API + '/bills', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok }, body: JSON.stringify(q[0]) })
        .then(function (r) {
          if (r.status === 401 || r.status === 403) { lsDel('vbs_atoken'); needLogin = true; throw new Error('auth'); }
          if (r.status === 400) { var f = jget('qb_failed', []); f.push(q[0]); jset('qb_failed', f); }   // keep a copy, never lose a bill
          else if (!r.ok) throw new Error('server');
          q.shift(); jset('qb_queue', q); setNet(true); step();
        })
        .catch(function () { syncing = false; updateBadge(); });
    })();
  }
  function updateBadge() {
    var n = jget('qb_queue', []).length, b = $('sync');
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
    if (job.canvas) { var img = new Image(); img.src = job.canvas.toDataURL('image/png'); img.className = 'pvimg'; box.innerHTML = ''; box.appendChild(img); }
    else box.innerHTML = '<pre class="pvtxt">' + esc(job.text) + '</pre><div class="hint">English-only fast mode (printer\'s own text)</div>';
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
  function openRecent() {
    var recent = jget('qb_recent', []), today = dateStr(new Date()), sumToday = 0, cnt = 0;
    recent.forEach(function (b) { if (dateStr(new Date(b.billDate)) === today) { sumToday += b.total; cnt++; } });
    $('rcSum').textContent = 'Today on this phone: ' + cnt + ' bills · ₹' + fmtR(sumToday);
    $('rcList').innerHTML = recent.length ? recent.map(function (b, i) {
      var d = new Date(b.billDate);
      return '<div class="rc"><div><b>' + esc(b.billNo) + '</b><div class="hint">' + dateStr(d) + ' ' + timeStr(d) + ' · ' + b.items.length + ' items</div></div>' +
        '<div class="rc-r"><b>₹' + fmtR(b.total) + '</b><button class="mini" data-re="' + i + '">Reprint</button></div></div>';
    }).join('') : '<div class="empty">No bills yet</div>';
    openModal('rc');
  }

  /* ---------- settings ---------- */
  function openSettings() {
    $('sWidth').value = S.width; $('sLang').value = S.lang; $('sMethod').value = S.method; $('sSpeed').value = S.speed;
    $('sAddr').checked = !!S.addr; $('sGst').value = S.gst; $('sPrefix').value = S.prefix;
    openModal('st');
  }
  function bindSettings() {
    $('sWidth').onchange = function () { S.width = parseInt(this.value, 10); saveSettings(); };
    $('sLang').onchange = function () { S.lang = this.value; saveSettings(); };
    $('sMethod').onchange = function () { S.method = this.value; saveSettings(); };
    $('sSpeed').onchange = function () { S.speed = this.value; saveSettings(); };
    $('sAddr').onchange = function () { S.addr = this.checked; saveSettings(); };
    $('sGst').onchange = function () { var v = parseFloat(this.value); if (isFinite(v) && v >= 0 && v < 100) { S.gst = v; saveSettings(); updateTotals(); } else this.value = S.gst; };
    $('sPrefix').onchange = function () { var v = this.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 6) || 'B'; this.value = v; S.prefix = v; saveSettings(); lsSet('qb_seq', '0'); refreshSeq(); };
  }

  /* ============================================================
     WIRING
     ============================================================ */
  function init() {
    bindSettings(); renderCart(); setPrinter(); updateBadge();

    $('cats').addEventListener('click', function (e) { var b = e.target.closest('[data-cat]'); if (!b) return; cat = b.dataset.cat; renderCats(); renderGrid(); });
    $('q').addEventListener('input', function () { query = this.value; renderGrid(); });
    $('grid').addEventListener('click', function (e) {
      var ed = e.target.closest('[data-edit]'); if (ed) { e.stopPropagation(); return openEdit(ed.dataset.edit); }
      var t = e.target.closest('.tile'); if (!t) return;
      var p = products.filter(function (x) { return x.id === t.dataset.id; })[0]; if (p) addProduct(p);
    });

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

    $('prn').onclick = function () { if (S.method === 'rawbt') return toast('Using RawBT – set printer inside the RawBT app'); bleConnect(true).then(function () { toast('Printer connected'); }).catch(printError); };
    $('sync').onclick = function () { if (needLogin || !lsGet('vbs_atoken', '')) openModal('lg'); else sync(); };
    $('recentBtn').onclick = openRecent;
    $('setBtn').onclick = openSettings;
    $('rcList').addEventListener('click', function (e) {
      var b = e.target.closest('[data-re]'); if (!b) return;
      var bill = jget('qb_recent', [])[parseInt(b.dataset.re, 10)]; if (bill) { closeModal('rc'); showPreview(bill, true); }
    });
    document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = function () { closeModal(b.dataset.close); }; });
    $('edSave').onclick = saveEdit; $('lgBtn').onclick = doLogin;
    $('lgPass').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    $('lgSkip').onclick = function () { closeModal('lg'); };

    window.addEventListener('online', function () { setNet(true); sync(); loadProducts(); });
    window.addEventListener('offline', function () { setNet(false); });

    loadProducts();
    if (!lsGet('vbs_atoken', '')) { needLogin = true; openModal('lg'); } else { refreshSeq(); sync(); }

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(function () {});
  }

  window.QB = { splitGst: splitGst, computeBill: computeBill };   // exposed for testing
  if (typeof document !== 'undefined' && document.getElementById('grid')) init();
})();
