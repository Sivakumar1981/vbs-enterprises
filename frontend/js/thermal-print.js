/* ============================================================
   VBS Enterprises – 80 mm thermal printing + in-page viewer
   Fixes:
   1. Receipt/report no longer opens in a new tab (that is what
      trapped the phone app with no Back button). It now opens in
      a full-screen in-page viewer with a ← Back button
      (the phone's own back button works too).
   2. Direct ESC/POS printing to a Bluetooth thermal printer:
        a) Web Bluetooth (Chrome on Android, BLE printers)
        b) RawBT app (works with ANY Bluetooth printer, incl. classic)
        c) Normal system print (fallback)
   ============================================================ */
(function () {
  'use strict';

  /* ---------- tiny helpers ---------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function say(icon, msg) {
    if (typeof window.toast === 'function') window.toast(icon, msg); else alert(msg);
  }
  function getCols() { return parseInt(lsGet('vbs_print_cols', '48'), 10) || 48; }

  /* ---------- ESC/POS builder ---------- */
  var ESC = 0x1b, GS = 0x1d;

  function clean(s) {               // printer-safe ASCII only
    s = String(s === undefined || s === null ? '' : s)
      .replace(/₹/g, 'Rs.').replace(/[–—]/g, '-').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    try { s = s.normalize('NFKD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {}
    var out = s.replace(/[^\x20-\x7E]/g, '?');
    if (out.indexOf('?') !== -1 && s.indexOf('?') === -1) clean.lossy = true;
    return out;
  }
  function wrap(text, width) {
    var words = clean(text).split(/\s+/), lines = [], cur = '';
    words.forEach(function (w) {
      while (w.length > width) {                       // very long word
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, width)); w = w.slice(width);
      }
      if ((cur + ' ' + w).trim().length > width) { lines.push(cur); cur = w; }
      else cur = (cur + ' ' + w).trim();
    });
    if (cur) lines.push(cur);
    return lines.length ? lines : [''];
  }
  function money(n) { return 'Rs.' + Number(n || 0).toLocaleString('en-IN'); }

  function Builder(cols) {
    var b = [];
    function push() { for (var i = 0; i < arguments.length; i++) b.push(arguments[i]); }
    function text(s) { s = clean(s); for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); }
    return {
      init: function () { push(ESC, 0x40); },
      align: function (a) { push(ESC, 0x61, a === 'c' ? 1 : a === 'r' ? 2 : 0); },
      bold: function (on) { push(ESC, 0x45, on ? 1 : 0); },
      size: function (big) { push(GS, 0x21, big ? 0x11 : 0x00); },
      line: function (s) { text(s || ''); push(0x0a); },
      wrapLine: function (s) { var self = this; wrap(s, cols).forEach(function (l) { self.line(l); }); },
      lr: function (l, r) {                              // left ... right
        l = clean(l); r = clean(r);
        var space = cols - r.length - 1;
        if (space < 4) { this.line(l); this.line(' '.repeat(Math.max(0, cols - r.length)) + r); return; }
        if (l.length > space) {
          var parts = wrap(l, space);
          for (var i = 0; i < parts.length - 1; i++) this.line(parts[i]);
          l = parts[parts.length - 1];
        }
        this.line(l + ' '.repeat(cols - l.length - r.length) + r);
      },
      rule: function (ch) { this.line((ch || '-').repeat(cols)); },
      feedCut: function () { push(0x0a, 0x0a, 0x0a, GS, 0x56, 0x42, 0x00); },
      bytes: function () { return new Uint8Array(b); }
    };
  }

  function buildReceipt(o) {
    var cols = getCols(), p = Builder(cols);
    clean.lossy = false;
    var date = new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    var itemsTotal = (o.items || []).reduce(function (s, i) { return s + i.price * i.quantity; }, 0);

    p.init();
    p.align('c'); p.bold(true); p.size(true); p.line('VBS ENTERPRISES'); p.size(false); p.bold(false);
    p.line('(Marachekku Oil)');
    p.line('108/7C, 5th Cross St, Rajiv Nagar');
    p.line('Pallikuppam, Vanagaram, Chennai-600077');
    p.line('Ph: 9840042290 / 9840357267');
    p.line('MSME UDYAM-TN-24-0183360');
    p.line('FSSAI: 22426477000262');
    p.line('GSTIN: 33FCHPS4318R1ZW');
    p.align('l'); p.rule();
    p.lr('Order:', o.orderId); p.lr('Date:', date); p.lr('Status:', String(o.status || '').toUpperCase());
    p.rule();
    p.bold(true); p.line('CUSTOMER'); p.bold(false);
    if (o.customer) {
      p.wrapLine(o.customer.name); p.wrapLine(o.customer.phone); p.wrapLine(o.customer.address);
    }
    p.rule();
    p.bold(true); p.line('ITEMS'); p.bold(false);
    (o.items || []).forEach(function (i) {
      p.wrapLine(i.name);
      p.lr('  ' + i.quantity + ' x Rs.' + i.price, money(i.price * i.quantity));
    });
    p.rule();
    var disc = o.discount || 0, cour = o.courierCharge || 0;
    if (disc > 0 || cour > 0) p.lr('Sub Total', money(itemsTotal));
    if (disc > 0) p.lr('Discount' + (o.discountedItem ? ' (' + o.discountedItem + ')' : ''), '- ' + money(disc));
    if (cour > 0) p.lr('Courier Charge', '+ ' + money(cour));
    p.rule('=');
    p.bold(true); p.size(true);
    var half = Math.floor(cols / 2);                     // double width => half the columns
    (function () {
      var l = 'TOTAL', r = money(o.totalAmount);
      p.line(l + ' '.repeat(Math.max(1, half - l.length - r.length)) + r);
    })();
    p.size(false); p.bold(false);
    p.rule('=');
    p.lr('Payment:', o.paymentMethod === 'cod' ? 'Cash on Delivery' : String(o.paymentMethod || '').toUpperCase());
    if (o.notes) p.wrapLine('Notes: ' + o.notes);
    p.rule();
    p.align('c');
    p.line('We Accept All Types of');
    p.line('Credit/Debit Cards & UPI Payments');
    p.line('');
    p.bold(true); p.line('Thank you for shopping!'); p.bold(false);
    p.line('Quality You Can Trust');
    p.feedCut();
    return { bytes: p.bytes(), lossy: clean.lossy };
  }

  /* ---------- Option A: Web Bluetooth (BLE printers) ---------- */
  var BLE = { device: null, chr: null };
  var PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb',
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455',
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb',
    '00001101-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb'
  ];

  async function findWritable(server) {
    var services = await server.getPrimaryServices();
    for (var s = 0; s < services.length; s++) {
      var chars = await services[s].getCharacteristics();
      for (var c = 0; c < chars.length; c++) {
        if (chars[c].properties.write || chars[c].properties.writeWithoutResponse) return chars[c];
      }
    }
    return null;
  }

  async function bleConnect(forcePick) {
    if (!navigator.bluetooth) throw new Error('NO_BLE');
    if (forcePick) { BLE.device = null; BLE.chr = null; }
    if (BLE.chr && BLE.device && BLE.device.gatt.connected) return BLE.chr;
    if (!BLE.device) {
      BLE.device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, optionalServices: PRINTER_SERVICES
      });
      BLE.device.addEventListener('gattserverdisconnected', function () { BLE.chr = null; });
    }
    var server = await BLE.device.gatt.connect();
    BLE.chr = await findWritable(server);
    if (!BLE.chr) throw new Error('NO_CHAR');
    return BLE.chr;
  }

  async function bleSend(bytes, forcePick) {
    var chr = await bleConnect(forcePick);
    var CH = 100;                                        // safe BLE chunk size
    for (var i = 0; i < bytes.length; i += CH) {
      var part = bytes.slice(i, i + CH);
      if (chr.properties.writeWithoutResponse && chr.writeValueWithoutResponse) await chr.writeValueWithoutResponse(part);
      else await chr.writeValue(part);
      await new Promise(function (r) { setTimeout(r, 25); });
    }
  }

  async function printBluetooth(order, forcePick) {
    var r = buildReceipt(order);
    try {
      say('🔵', BLE.chr ? 'Printing…' : 'Choose your printer…');
      await bleSend(r.bytes, forcePick);
      say('✅', 'Sent to printer' + (r.lossy ? ' (non-English letters replaced with ?)' : ''));
    } catch (e) {
      BLE.chr = null;
      if (e && e.name === 'NotFoundError') { say('ℹ️', 'No printer selected'); return; }
      if (e && e.message === 'NO_BLE') {
        say('⚠️', 'This browser has no Bluetooth printing. Use the RawBT button (see Help).'); return;
      }
      if (e && e.message === 'NO_CHAR') {
        say('⚠️', 'Printer not supported by Web Bluetooth. Use the RawBT button.'); return;
      }
      console.error(e);
      say('❌', 'Could not print: ' + (e && e.message ? e.message : e) + ' — try RawBT.');
    }
  }

  /* ---------- Option B: RawBT app (any Bluetooth printer) ---------- */
  function printRawBT(order) {
    var r = buildReceipt(order), bin = '';
    for (var i = 0; i < r.bytes.length; i++) bin += String.fromCharCode(r.bytes[i]);
    window.location.href = 'rawbt:base64,' + btoa(bin);
  }

  /* ---------- In-page full-screen viewer (replaces window.open) ---------- */
  var overlay = null, frame = null, poppedByBack = false;

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove(); overlay = null; frame = null;
    document.body.style.overflow = overlay_prevOverflow || '';
  }
  var overlay_prevOverflow = '';

  function onPop() {
    if (overlay) { poppedByBack = true; closeOverlay(); }
  }
  window.addEventListener('popstate', onPop);

  function goBack() {
    if (!overlay) return;
    if (history.state && history.state.vbsOverlay) history.back();   // triggers popstate -> close
    else closeOverlay();
  }

  function btn(label, bg, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.onclick = fn;
    b.style.cssText = 'border:none;border-radius:8px;padding:9px 12px;font-size:14px;font-weight:600;color:#fff;background:' + bg + ';cursor:pointer;white-space:nowrap';
    return b;
  }

  function openOverlay(html, opts) {
    opts = opts || {};
    if (overlay) closeOverlay();
    overlay_prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#e9e9e9;display:flex;flex-direction:column;';

    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;padding-top:calc(8px + env(safe-area-inset-top,0px));background:#1a1a1a;';
    bar.appendChild(btn('← Back', '#555', goBack));

    if (opts.order) {
      bar.appendChild(btn('🔵 Bluetooth Print', '#0a7d33', function () { printBluetooth(opts.order, false); }));
      bar.appendChild(btn('📲 RawBT', '#c8902a', function () { printRawBT(opts.order); }));
      bar.appendChild(btn('🖨️ System Print', '#2a62c8', systemPrint));

      var set = document.createElement('div');
      set.style.cssText = 'display:flex;gap:6px;align-items:center;color:#ccc;font-size:12px;margin-left:auto';
      var sel = document.createElement('select');
      sel.style.cssText = 'padding:6px;border-radius:6px;font-size:12px';
      [['48', '80mm · 48 col'], ['42', '80mm · 42 col'], ['32', '58mm · 32 col']].forEach(function (o) {
        var op = document.createElement('option'); op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
      });
      sel.value = String(getCols());
      sel.onchange = function () { lsSet('vbs_print_cols', sel.value); };
      set.appendChild(sel);
      set.appendChild(btn('Change printer', '#444', function () { printBluetooth(opts.order, true); }));
      bar.appendChild(set);
    } else {
      bar.appendChild(btn('🖨️ Print / Save PDF', '#2a62c8', systemPrint));
    }

    frame = document.createElement('iframe');
    frame.style.cssText = 'flex:1;width:100%;border:0;background:#fff;';
    frame.setAttribute('srcdoc', html);

    overlay.appendChild(bar);
    overlay.appendChild(frame);
    document.body.appendChild(overlay);

    try { history.pushState({ vbsOverlay: 1 }, ''); } catch (e) {}
  }

  function systemPrint() {
    try { frame.contentWindow.focus(); frame.contentWindow.print(); }
    catch (e) { say('❌', 'System print not available here — use Bluetooth Print or RawBT'); }
  }

  /* generic replacement for the old  window.open(blobUrl,'_blank')  */
  window.openDocOverlay = function (html) { openOverlay(html, {}); };

  /* ---------- Invoice (order receipt) – replaces old viewInvoice ---------- */
  window.viewInvoice = function (orderId) {
    var API_BASE = (typeof API !== 'undefined') ? API : '/api';
    var tok = (typeof token !== 'undefined') ? token : '';
    var cached = (window._allOrders || []).find(function (x) { return x._id === orderId; });
    function show(o) {
      var html = window.generateInvoiceHTML(o)
        .replace(/<button onclick="window\.print\(\)"[\s\S]*?<\/button>/, '');   // we have our own buttons
      openOverlay(html, { order: o });
    }
    if (cached) { show(cached); return; }
    fetch(API_BASE + '/orders?limit=9999', { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var o = d.orders ? d.orders.find(function (x) { return x._id === orderId; }) : null;
        if (!o) { say('❌', 'Order not found'); return; }
        show(o);
      })
      .catch(function () { say('❌', 'Could not load order'); });
  };

  /* Quick one-tap print from anywhere:  printOrderThermal(orderId) */
  window.printOrderThermal = function (orderId) {
    var o = (window._allOrders || []).find(function (x) { return x._id === orderId; });
    if (o) printBluetooth(o, false); else window.viewInvoice(orderId);
  };
})();
