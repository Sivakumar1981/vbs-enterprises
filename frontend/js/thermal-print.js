/* ============================================================
   VBS Enterprises – 80 mm thermal printing (v3)
   - Receipt is drawn as a picture, so Tamil, bold fonts and the
     exact layout print the same on every printer.
   - Bill opens in an in-page viewer with a ← Back button
     (no new tab, so the app never gets stuck).
   - Print via: Bluetooth (Chrome/Android), RawBT app, or system print.
   ============================================================ */
(function () {
  'use strict';
  var VERSION = 'v3';

  /* ---------- helpers ---------- */
  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function say(icon, msg) {
    if (typeof window.toast === 'function') window.toast(icon, msg); else alert(msg);
  }
  function getWidth() { return parseInt(lsGet('vbs_print_w', '576'), 10) || 576; }
  function inr(n) { return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /* ---------- receipt drawing (canvas) ---------- */
  var FONT = "'Noto Sans Tamil','Noto Sans','Nirmala UI','Latha','Tamil Sangam MN',Arial,Helvetica,sans-serif";

  function renderReceiptCanvas(o, W) {
    var S = W / 576, M = Math.round(8 * S);
    function px(n) { return Math.round(n * S); }

    var d = new Date(o.createdAt || Date.now());
    var dateStr = pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + d.getFullYear();
    var h = d.getHours(), ampm = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
    var timeStr = pad2(h) + ':' + pad2(d.getMinutes()) + ':' + ampm;
    var items = o.items || [];
    var itemsTotal = items.reduce(function (s, i) { return s + i.price * i.quantity; }, 0);
    var totalQty = items.reduce(function (s, i) { return s + (Number(i.quantity) || 0); }, 0);
    var disc = o.discount || 0, cour = o.courierCharge || 0;
    var pay = o.billType || (o.paymentMethod === 'cod' ? 'CASH ON DELIVERY' : String(o.paymentMethod || '').toUpperCase());

    function pass(ctx, draw) {
      var y = px(14);
      function setFont(size, weight) { ctx.font = (weight || 'bold') + ' ' + px(size) + 'px ' + FONT; }
      function put(str, x, yy, align) {
        if (!draw) return;
        ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic';
        ctx.fillText(str, x, yy);
        ctx.lineWidth = Math.max(0.8, S * 0.9); ctx.strokeText(str, x, yy);   // makes text bolder like the sample
      }
      function wrap(str, maxW) {
        var words = String(str === undefined || str === null ? '' : str).split(/\s+/).filter(Boolean), lines = [], cur = '';
        words.forEach(function (w) {
          var t = cur ? cur + ' ' + w : w;
          if (ctx.measureText(t).width <= maxW) { cur = t; return; }
          if (cur) { lines.push(cur); cur = ''; }
          if (ctx.measureText(w).width <= maxW) { cur = w; return; }
          var chars = Array.from(w), piece = '';
          chars.forEach(function (ch) {
            if (ctx.measureText(piece + ch).width > maxW && piece) { lines.push(piece); piece = ch; } else piece += ch;
          });
          cur = piece;
        });
        if (cur) lines.push(cur);
        return lines.length ? lines : [''];
      }
      function center(str, size) {
        setFont(size); var lh = px(size * 1.3);
        wrap(str, W - 2 * M).forEach(function (l) { y += lh; put(l, W / 2, y - px(size * 0.25), 'center'); });
      }
      function left(str, size) {
        setFont(size); var lh = px(size * 1.3);
        wrap(str, W - 2 * M).forEach(function (l) { y += lh; put(l, M, y - px(size * 0.25), 'left'); });
      }
      function pair(l, r, size) {
        setFont(size); var lh = px(size * 1.3);
        if (ctx.measureText(l).width + ctx.measureText(r).width + px(16) <= W - 2 * M) {
          y += lh; put(l, M, y - px(size * 0.25), 'left'); put(r, W - M, y - px(size * 0.25), 'right');
        } else {
          left(l, size); setFont(size); y += lh; put(r, W - M, y - px(size * 0.25), 'right');
        }
      }
      function dash() {
        y += px(8);
        if (draw) {
          ctx.save(); ctx.setLineDash([px(7), px(4)]); ctx.lineWidth = Math.max(2, px(2.5)); ctx.strokeStyle = '#000';
          ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.restore();
        }
        y += px(10);
      }

      /* header */
      center('VBS ENTERPRISES', 40);
      center('(Marachekku Oil)', 22);
      center('108/7C, 5th Cross St, Rajiv Nagar', 22);
      center('Pallikuppam, Vanagaram, Chennai-600077', 22);
      center('Ph: 9840042290 / 9840357267', 24);
      center('MSME UDYAM-TN-24-0183360', 20);
      center('FSSAI: 22426477000262', 20);
      center('GSTIN: 33FCHPS4318R1ZW', 20);
      dash();

      /* bill info */
      pair('Bill No : ' + (o.orderId || ''), 'Date : ' + dateStr, 26);
      pair('Bill Type : ' + pay, 'Time : ' + timeStr, 26);
      dash();

      /* customer (Tamil supported) */
      var cu = o.customer || {};
      var cName = (cu.name || '').trim(), cPhone = (cu.phone || '').trim(), cAddr = (cu.address || '').trim();
      if (cPhone === '-') cPhone = ''; if (cAddr === '-') cAddr = '';
      if (cName.toLowerCase() === 'walk-in' || cName === '-') cName = '';
      if (cName || cPhone || cAddr) {
        if (cName) left('Name : ' + cName, 26);
        if (cPhone) left('Ph : ' + cPhone, 24);
        if (cAddr) left(cAddr, 24);
        dash();
      }

      /* table header */
      var cQty = Math.round(W * 0.56), cRate = Math.round(W * 0.76), cAmt = W - M;
      setFont(24); y += px(31);
      put('DESCRIPTION', M, y - px(6), 'left'); put('QTY', cQty, y - px(6), 'right');
      put('RATE', cRate, y - px(6), 'right'); put('AMOUNT', cAmt, y - px(6), 'right');
      dash();

      /* items */
      items.forEach(function (it) {
        left(it.name || '', 26);
        setFont(26); y += px(34);
        put(String(it.quantity), cQty, y - px(8), 'right');
        put(inr(it.price), cRate, y - px(8), 'right');
        put(inr(it.price * it.quantity), cAmt, y - px(8), 'right');
        y += px(4);
      });
      dash();

      /* amounts */
      if (disc > 0 || cour > 0) pair('Sub Total :', inr(itemsTotal), 26);
      if (disc > 0) pair('Discount' + (o.discountedItem ? ' (' + o.discountedItem + ')' : '') + ' :', '- ' + inr(disc), 26);
      if (cour > 0) pair('Courier Charge :', '+ ' + inr(cour), 26);
      if (disc > 0 || cour > 0) dash();
      setFont(38); y += px(52);
      put('Total Amount :', M + px(40), y - px(12), 'left');
      put(inr(o.totalAmount), W - M, y - px(12), 'right');
      dash();

      /* total items / qty */
      pair('Total Items : ' + items.length, 'Total Qty : ' + totalQty, 26);
      dash();
      if (o.notes) { left('Notes : ' + o.notes, 24); dash(); }

      center('We accept Cards & UPI', 22);
      center('Thank You !!! Visit Again !!!', 26);
      y += px(30);
      return y;
    }

    var probe = makeCanvas(W, 10), pctx = probe.getContext('2d');
    var H = pass(pctx, false);
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#000'; ctx.strokeStyle = '#000';
    pass(ctx, true);
    return c;
  }

  function makeCanvas(w, h) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; return c;
  }

  /* ---------- canvas -> ESC/POS raster bytes ---------- */
  function canvasToEscPos(canvas) {
    var W = canvas.width, H = canvas.height, ctx = canvas.getContext('2d');
    var data = ctx.getImageData(0, 0, W, H).data, wb = Math.ceil(W / 8);
    var out = [0x1b, 0x40];                                   // ESC @ init
    var BAND = 200;
    for (var y0 = 0; y0 < H; y0 += BAND) {
      var rows = Math.min(BAND, H - y0);
      out.push(0x1d, 0x76, 0x30, 0x00, wb & 255, wb >> 8, rows & 255, rows >> 8);   // GS v 0
      for (var y = y0; y < y0 + rows; y++) {
        for (var xb = 0; xb < wb; xb++) {
          var byte = 0;
          for (var bit = 0; bit < 8; bit++) {
            var x = xb * 8 + bit;
            if (x < W) {
              var i = (y * W + x) * 4;
              var g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
              if (g < 175 && data[i + 3] > 0) byte |= (0x80 >> bit);
            }
          }
          out.push(byte);
        }
      }
    }
    out.push(0x1b, 0x64, 0x04);                               // feed 4 lines
    out.push(0x1d, 0x56, 0x42, 0x00);                         // partial cut
    return new Uint8Array(out);
  }

  /* ---------- Option A: Web Bluetooth ---------- */
  var BLE = { device: null, chr: null };
  var PRINTER_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb', '00001101-0000-1000-8000-00805f9b34fb',
    '0000fff0-0000-1000-8000-00805f9b34fb', '0000ffe5-0000-1000-8000-00805f9b34fb'
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
    if (forcePick) { try { if (BLE.device && BLE.device.gatt.connected) BLE.device.gatt.disconnect(); } catch (e) {} BLE.device = null; BLE.chr = null; }
    if (BLE.chr && BLE.device && BLE.device.gatt.connected) return BLE.chr;
    if (!BLE.device) {
      BLE.device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true, optionalServices: PRINTER_SERVICES });
      BLE.device.addEventListener('gattserverdisconnected', function () { BLE.chr = null; });
    }
    var server = await BLE.device.gatt.connect();
    BLE.chr = await findWritable(server);
    if (!BLE.chr) throw new Error('NO_CHAR');
    return BLE.chr;
  }
  async function bleWrite(chr, bytes, CH) {
    for (var i = 0; i < bytes.length; i += CH) {
      var part = bytes.slice(i, i + CH);
      if (chr.properties.writeWithoutResponse && chr.writeValueWithoutResponse) await chr.writeValueWithoutResponse(part);
      else await chr.writeValue(part);
      await new Promise(function (r) { setTimeout(r, 12); });
    }
  }
  async function printBluetooth(order, forcePick) {
    try {
      var bytes = canvasToEscPos(renderReceiptCanvas(order, getWidth()));
      say('🔵', BLE.chr ? 'Printing…' : 'Choose your printer…');
      var chr = await bleConnect(forcePick);
      try { await bleWrite(chr, bytes, 180); }
      catch (e1) { chr = await bleConnect(false); await bleWrite(chr, bytes, 20); }   // slow but safe
      say('✅', 'Sent to printer');
    } catch (e) {
      BLE.chr = null;
      if (e && e.name === 'NotFoundError') { say('ℹ️', 'No printer selected'); return; }
      if (e && e.message === 'NO_BLE') { say('⚠️', 'Bluetooth not supported in this browser. Use the RawBT button.'); return; }
      if (e && e.message === 'NO_CHAR') { say('⚠️', 'This printer cannot be used from the browser. Use the RawBT button.'); return; }
      console.error(e);
      say('❌', 'Could not print (' + (e && e.message ? e.message : e) + '). Use the RawBT button.');
    }
  }

  /* ---------- Option B: RawBT app (any Bluetooth printer) ---------- */
  function printRawBT(order) {
    var bytes = canvasToEscPos(renderReceiptCanvas(order, getWidth())), bin = '', CH = 8192;
    for (var i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    var a = document.createElement('a');
    a.href = 'rawbt:base64,' + btoa(bin);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    say('📲', 'Opening RawBT… (install the RawBT app if nothing happens)');
  }

  /* ---------- in-page viewer (replaces window.open) ---------- */
  var overlay = null, bodyBox = null, lastOrder = null, prevOverflow = '';

  function closeOverlay() {
    if (!overlay) return;
    overlay.remove(); overlay = null; bodyBox = null; lastOrder = null;
    document.body.style.overflow = prevOverflow;
  }
  window.addEventListener('popstate', function () { closeOverlay(); });
  function goBack() {
    if (!overlay) return;
    if (history.state && history.state.vbsOverlay) history.back(); else closeOverlay();
  }
  function btn(label, bg, fn) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = label; b.onclick = fn;
    b.style.cssText = 'border:none;border-radius:8px;padding:10px 12px;font-size:14px;font-weight:600;color:#fff;background:' + bg + ';cursor:pointer;white-space:nowrap';
    return b;
  }
  function openShell(title) {
    if (overlay) closeOverlay();
    prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#d9d9d9;display:flex;flex-direction:column;';
    var bar = document.createElement('div');
    bar.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 10px;padding-top:calc(8px + env(safe-area-inset-top,0px));background:#1a1a1a;';
    bar.appendChild(btn('← Back', '#666', goBack));
    overlay.appendChild(bar);
    bodyBox = document.createElement('div');
    bodyBox.style.cssText = 'flex:1;overflow:auto;-webkit-overflow-scrolling:touch;';
    overlay.appendChild(bodyBox);
    document.body.appendChild(overlay);
    try { history.pushState({ vbsOverlay: 1 }, ''); } catch (e) {}
    return bar;
  }

  /* receipt viewer */
  function openReceipt(o, opts) {
    opts = opts || {};
    lastOrder = o;
    var bar = openShell();
    if (opts.onNew) bar.appendChild(btn('➕ New Bill', '#0a7d33', function () { closeOverlay(); opts.onNew(); }));
    bar.appendChild(btn('🔵 Bluetooth Print', '#0a7d33', function () { printBluetooth(o, false); }));
    bar.appendChild(btn('📲 RawBT Print', '#c8902a', function () { printRawBT(o); }));
    bar.appendChild(btn('🖨️ System Print', '#2a62c8', function () { systemPrintReceipt(o); }));
    var set = document.createElement('div');
    set.style.cssText = 'display:flex;gap:6px;align-items:center;margin-left:auto;color:#aaa;font-size:11px';
    var sel = document.createElement('select');
    sel.style.cssText = 'padding:6px;border-radius:6px;font-size:12px';
    [['576', '80mm (576)'], ['512', '80mm narrow (512)'], ['384', '58mm (384)']].forEach(function (p) {
      var op = document.createElement('option'); op.value = p[0]; op.textContent = p[1]; sel.appendChild(op);
    });
    sel.value = String(getWidth());
    sel.onchange = function () { lsSet('vbs_print_w', sel.value); drawPreview(o); };
    set.appendChild(sel);
    set.appendChild(btn('Change printer', '#444', function () { printBluetooth(o, true); }));
    set.appendChild(document.createTextNode(VERSION));
    bar.appendChild(set);
    drawPreview(o);
  }
  function drawPreview(o) {
    var c = renderReceiptCanvas(o, getWidth());
    var img = document.createElement('img');
    img.src = c.toDataURL('image/png');
    img.style.cssText = 'display:block;margin:12px auto;width:100%;max-width:' + Math.round(getWidth() * 0.75) + 'px;background:#fff;box-shadow:0 2px 10px rgba(0,0,0,.3)';
    bodyBox.innerHTML = ''; bodyBox.appendChild(img);
  }
  function systemPrintReceipt(o) {
    var src = renderReceiptCanvas(o, getWidth()).toDataURL('image/png');
    var f = document.createElement('iframe');
    f.style.cssText = 'position:absolute;width:0;height:0;border:0;left:-9999px';
    f.srcdoc = '<html><head><style>@page{size:80mm auto;margin:0}html,body{margin:0;padding:0}img{display:block;width:72mm;margin:0 auto}</style></head><body><img id="r" src="' + src + '"></body></html>';
    f.onload = function () {
      setTimeout(function () {
        try { f.contentWindow.focus(); f.contentWindow.print(); }
        catch (e) { say('❌', 'System print not available — use Bluetooth or RawBT'); }
        setTimeout(function () { f.remove(); }, 60000);
      }, 400);
    };
    overlay.appendChild(f);
  }

  /* report viewer (A4 reports: tally / purchase) */
  window.openDocOverlay = function (html) {
    var bar = openShell();
    var frame = document.createElement('iframe');
    frame.style.cssText = 'width:100%;height:100%;border:0;background:#fff;';
    frame.srcdoc = html;
    bodyBox.style.overflow = 'hidden';
    bodyBox.appendChild(frame);
    bar.appendChild(btn('🖨️ Print / Save PDF', '#2a62c8', function () {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); } catch (e) { say('❌', 'Print not available here'); }
    }));
  };

  /* ---------- replace the old invoice view ---------- */
  window.viewInvoice = function (orderId) {
    var API_BASE = (typeof API !== 'undefined') ? API : '/api';
    var tok = (typeof token !== 'undefined') ? token : '';
    var cached = (window._allOrders || []).find(function (x) { return x._id === orderId; });
    if (cached) { openReceipt(cached); return; }
    fetch(API_BASE + '/orders?limit=9999', { headers: { Authorization: 'Bearer ' + tok } })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var o = d.orders ? d.orders.find(function (x) { return x._id === orderId; }) : null;
        if (!o) { say('❌', 'Order not found'); return; }
        openReceipt(o);
      })
      .catch(function () { say('❌', 'Could not load order'); });
  };
  window.printOrderThermal = function (orderId) {
    var o = (window._allOrders || []).find(function (x) { return x._id === orderId; });
    if (o) printBluetooth(o, false); else window.viewInvoice(orderId);
  };

  window.vbsOpenReceipt = openReceipt;
  window.vbsPrintRawBT = printRawBT;
  window.vbsPrintBluetooth = printBluetooth;
  window.__vbsPrint = { renderReceiptCanvas: renderReceiptCanvas, canvasToEscPos: canvasToEscPos, version: VERSION };
})();
