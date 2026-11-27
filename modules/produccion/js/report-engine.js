/* CASUR · Motor de informes R2 (autorizado 26-Nov-2026, docs/PROPUESTA_REDISENO_INFORMES.md).
   Un solo diseño (lista de dibujo por página, en puntos) alimenta dos salidas: PDF vectorial con texto seleccionable
   (jsPDF 4.2.1 + Inter incrustada) y PNG de alta resolución (canvas 2D con la misma fuente). Los datos salen de los
   motores oficiales y del panel oficial del informe; aquí no se recalcula ninguna cifra oficial.
   Recursos locales (precaché PWA): vendor/jspdf/jspdf.umd.min.js, assets/fonts/report/Inter-*.ttf, assets/negocios-de-cana.webp. */
(function () {
  'use strict';
  const FONT = 'Inter', CANVAS_FONT = 'CasurReportInter';
  const WEIGHTS = {normal: ['Inter-Regular.ttf', 400], semibold: ['Inter-SemiBold.ttf', 600], bold: ['Inter-Bold.ttf', 700]};
  const C = {ink: '#173B46', petrol: '#1F4E5C', text: '#2B3542', muted: '#576579', line: '#D9E0E4', soft: '#F3F6F7', softer: '#F8FAFB',
    gold: '#C9A54B', blue: '#2F86AD', red: '#9A3412', green: '#2E6B4F', white: '#FFFFFF', zebra: '#F6F8F9', section: '#E8EEF0'};
  const PAGE = {portrait: [612, 792], landscape: [792, 612]}, M = 34, FOOT = 22;
  const PNG_MAX_SIDE = 16000, PNG_MAX_AREA = 32e6; // Android/Chrome: ≤ 16,384 px por lado; ~128 MB RGBA como techo de memoria.

  // ---------- recursos (carga perezosa, una sola vez) ----------
  let assetsPromise = null;
  const b64 = buf => { const bytes = new Uint8Array(buf); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const script = src => new Promise((ok, ko) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => ko(new Error('No se pudo cargar ' + src)); document.head.appendChild(s); });
  function assets() {
    if (assetsPromise) return assetsPromise;
    assetsPromise = (async () => {
      if (!window.jspdf) await script('vendor/jspdf/jspdf.umd.min.js');
      const fonts = {};
      for (const [style, [file, weight]] of Object.entries(WEIGHTS)) {
        const res = await fetch('assets/fonts/report/' + file); if (!res.ok) throw new Error('Fuente no disponible: ' + file);
        const buf = await res.arrayBuffer(); fonts[style] = {file, b64: b64(buf)};
        try { const face = new FontFace(CANVAS_FONT, buf, {weight: String(weight)}); await face.load(); document.fonts.add(face); } catch (e) { /* PNG usará la fuente del sistema */ }
      }
      let logo = null;
      try { const res = await fetch('assets/negocios-de-cana.webp'); const bmp = await createImageBitmap(await res.blob()); const cv = document.createElement('canvas'); cv.width = 240; cv.height = Math.round(240 * bmp.height / bmp.width); cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height); logo = {url: cv.toDataURL('image/png'), w: cv.width, h: cv.height, bmp}; } catch (e) { logo = null; }
      return {fonts, logo};
    })();
    assetsPromise.catch(() => { assetsPromise = null; });
    return assetsPromise;
  }
  function newPdf(A, orientation) {
    const pdf = new window.jspdf.jsPDF({unit: 'pt', format: 'letter', orientation, compress: true, putOnlyUsedFonts: true});
    for (const [style, f] of Object.entries(A.fonts)) { pdf.addFileToVFS(f.file, f.b64); pdf.addFont(f.file, FONT, style); }
    pdf.setFont(FONT, 'normal'); return pdf;
  }

  // ---------- medición y texto ----------
  function measurer(A) {
    const pdf = newPdf(A, 'portrait'), cache = new Map();
    const width = (str, size, weight = 'normal') => { const k = weight + size + '|' + str; if (!cache.has(k)) { pdf.setFont(FONT, weight); pdf.setFontSize(size); cache.set(k, pdf.getTextWidth(String(str))); } return cache.get(k); };
    const wrap = (str, size, weight, max, maxLines = 99) => {
      const out = [], words = String(str ?? '').replace(/\s+/g, ' ').trim().split(' ');
      let line = '';
      for (const w of words) {
        const cand = line ? line + ' ' + w : w;
        if (width(cand, size, weight) <= max) { line = cand; continue; }
        if (line) out.push(line);
        if (width(w, size, weight) <= max) { line = w; continue; }
        let chunk = ''; for (const ch of w) { if (width(chunk + ch, size, weight) > max && chunk) { out.push(chunk); chunk = ch; } else chunk += ch; } line = chunk;
      }
      if (line || !out.length) out.push(line);
      if (out.length > maxLines) { const cut = out.slice(0, maxLines); let last = cut[maxLines - 1]; while (last && width(last + '…', size, weight) > max) last = last.slice(0, -1); cut[maxLines - 1] = last + '…'; return cut; }
      return out;
    };
    return {width, wrap};
  }

  // ---------- documento: páginas con lista de dibujo ----------
  class Doc {
    constructor(A, meta) { this.A = A; this.meta = meta; this.m = measurer(A); this.pages = []; this.y = 0; }
    get page() { return this.pages[this.pages.length - 1]; }
    newPage(orientation) {
      const [w, h] = PAGE[orientation || this.page?.orientation || 'portrait'];
      const p = {orientation: orientation || this.page?.orientation || 'portrait', w, h, ops: []}; this.pages.push(p);
      this.y = this.header(p, this.pages.length === 1); return p;
    }
    get bottom() { return this.page.h - M - FOOT; }
    get width() { return this.page.w - 2 * M; }
    space(h) { return this.y + h <= this.bottom + 0.01; }
    op(o) { this.page.ops.push(o); }
    text(x, y, str, size, weight = 'normal', color = C.text, align = 'left') { this.op({t: 'text', x, y: y + size * 0.82, str: String(str), size, weight, color, align}); }
    rect(x, y, w, h, fill, stroke, r = 0, lw = 0.6) { this.op({t: 'rect', x, y, w, h, fill, stroke, r, lw}); }
    line(x1, y1, x2, y2, color = C.line, lw = 0.6, dash = null) { this.op({t: 'line', x1, y1, x2, y2, color, lw, dash}); }
    poly(pts, color, lw = 1.4, dash = null) { this.op({t: 'poly', pts, color, lw, dash}); }
    dot(x, y, r, color) { this.op({t: 'dot', x, y, r, color}); }
    header(p, first) {
      const x = M, w = p.w - 2 * M, meta = this.meta, A = this.A;
      if (first) {
        let tx = x;
        if (A.logo) { const lh = 44, lw = lh * A.logo.w / A.logo.h; this.op({t: 'img', x, y: M - 4, w: lw, h: lh}); tx = x + lw + 12; }
        this.text(tx, M - 2, meta.title, 15, 'bold', C.ink);
        this.text(tx, M + 17, meta.subject, 10.5, 'semibold', C.petrol);
        let my = M + 31; (meta.lines || []).forEach(l => { this.text(tx, my, l, 7.3, 'normal', C.muted); my += 9.2; });
        this.text(x + w, M - 1, 'Negocios de Caña · CASUR', 7.5, 'semibold', C.petrol, 'right');
        this.text(x + w, M + 9, 'Consulta: ' + meta.consulta, 7.3, 'normal', C.muted, 'right');
        const yy = Math.max(M + 44, my + 2); this.line(x, yy, x + w, yy, C.petrol, 1.4); return yy + 10;
      }
      this.text(x, M - 6, meta.title + ' · ' + meta.subject, 7.8, 'semibold', C.ink);
      this.text(x + w, M - 6, 'Negocios de Caña · CASUR', 7.3, 'normal', C.muted, 'right');
      this.line(x, M + 6, x + w, M + 6, C.petrol, 0.8); return M + 14;
    }
    footers() {
      const n = this.pages.length;
      this.pages.forEach((p, i) => {
        const y = p.h - M - 8; p.ops.push({t: 'line', x1: M, y1: y, x2: p.w - M, y2: y, color: C.line, lw: 0.6});
        p.ops.push({t: 'text', x: M, y: y + 5 + 7 * 0.82, str: 'CASUR · Negocios de Caña · Documento de consulta · ' + this.meta.footer, size: 6.8, weight: 'normal', color: C.muted, align: 'left'});
        p.ops.push({t: 'text', x: p.w - M, y: y + 5 + 7 * 0.82, str: 'Página ' + (i + 1) + ' de ' + n, size: 6.8, weight: 'semibold', color: C.muted, align: 'right'});
      });
    }
    // Flow: a block is atomic unless it can split (tables). keepNext keeps a heading with the start of the next block.
    add(block) {
      if (!this.pages.length) this.newPage(block.orientation);
      const w = this.width, h = block.measure(this, w);
      if (block.split) return block.split(this, w);
      const need = h + (block.keepNext || 0);
      if (!this.space(need) && this.y > this.pageTop() + 1) this.newPage();
      block.draw(this, M, this.y, w); this.y += h + (block.gap ?? 10);
    }
    pageTop() { return this.pages.length === 1 ? 0 : M + 14; }
    // Calidad: ningún trazo ni texto fuera de los márgenes laterales ni de la zona segura de impresión (18 pt del borde).
    audit() {
      let out = 0, samples = [];
      this.pages.forEach((p, i) => p.ops.forEach(o => {
        let x1, x2, y1, y2;
        if (o.t === 'text') { const w = this.m.width(o.str, o.size, o.weight); x1 = o.align === 'right' ? o.x - w : o.align === 'center' ? o.x - w / 2 : o.x; x2 = x1 + w; y1 = o.y - o.size * 0.82; y2 = o.y + o.size * 0.22; }
        else if (o.t === 'rect' || o.t === 'img') { x1 = o.x; x2 = o.x + o.w; y1 = o.y; y2 = o.y + o.h; }
        else if (o.t === 'line') { x1 = Math.min(o.x1, o.x2); x2 = Math.max(o.x1, o.x2); y1 = Math.min(o.y1, o.y2); y2 = Math.max(o.y1, o.y2); }
        else return;
        if (x1 < M - 1 || x2 > p.w - M + 1 || y1 < 18 || y2 > p.h - 18) { out++; if (samples.length < 5) samples.push({page: i + 1, op: o.t, str: o.str, x1: Math.round(x1), x2: Math.round(x2)}); }
      }));
      return {outOfBounds: out, samples, pages: this.pages.length, orientations: this.pages.map(p => p.orientation)};
    }
    section(orientation) { if (!this.pages.length || this.y > this.pageTop() + 1 || this.page.orientation !== orientation) this.newPage(orientation); }
  }

  // ---------- bloques ----------
  const heading = (title, sub, keepNext = 70) => ({
    keepNext, gap: 6,
    measure(d) { return 14 + (sub ? 10 : 0); },
    draw(d, x, y, w) { d.text(x, y, title, 10.5, 'bold', C.ink); if (sub) d.text(x, y + 14, sub, 7.3, 'normal', C.muted); d.line(x, y + (sub ? 25 : 15), x + w, y + (sub ? 25 : 15), C.line, 0.5); }
  });
  const kpis = (items, cols = items.length) => ({
    rows(d, w) { const cw = (w - (cols - 1) * 8) / cols; return items.map(it => ({...it, lab: d.m.wrap(it.label, 7.2, 'semibold', cw - 16, 2), note: it.note ? d.m.wrap(it.note, 6.8, 'normal', cw - 16, 2) : []})); },
    measure(d, w) { const r = this.rows(d, w), per = []; for (let i = 0; i < r.length; i += cols) per.push(Math.max(...r.slice(i, i + cols).map(x => 10 + x.lab.length * 8.6 + 18 + x.note.length * 8.2 + 6))); this._per = per; this._r = r; return per.reduce((a, b) => a + b, 0) + (per.length - 1) * 8; },
    draw(d, x, y, w) {
      const cw = (w - (cols - 1) * 8) / cols; let yy = y;
      this._per.forEach((rh, ri) => {
        this._r.slice(ri * cols, ri * cols + cols).forEach((k, i) => {
          const cx = x + i * (cw + 8); d.rect(cx, yy, cw, rh, C.white, C.line, 4); d.rect(cx, yy, cw, 3, k.accent || C.petrol, null, 0);
          let ty = yy + 9; k.lab.forEach(l => { d.text(cx + 8, ty, l, 7.2, 'semibold', C.muted); ty += 8.6; });
          d.text(cx + 8, ty + 1, k.value, 14.5, 'bold', C.ink); if (k.unit) d.text(cx + 8 + d.m.width(k.value, 14.5, 'bold') + 3, ty + 6, k.unit, 7.5, 'semibold', C.muted);
          ty += 19; k.note.forEach(l => { d.text(cx + 8, ty, l, 6.8, 'normal', C.muted); ty += 8.2; });
        }); yy += rh + 8;
      });
    }
  });
  // Grupos de variables (ficha): tarjetas en columnas, filas etiqueta / valor.
  const groups = (list, cols = 2) => ({
    lay(d, w) {
      const cw = (w - (cols - 1) * 10) / cols, lw = cw * 0.46, vw = cw - lw - 18;
      return list.map(g => { const rows = g.items.filter(Boolean).map(([l, v]) => ({l: d.m.wrap(l, 7.4, 'normal', lw, 2), v: d.m.wrap(v ?? '—', 8, 'semibold', vw, 4)})); return {g, rows, h: 22 + rows.reduce((n, r) => n + Math.max(r.l.length, r.v.length) * 9.6 + 3.2, 0) + 4}; });
    },
    measure(d, w) { const L = this.lay(d, w); this._L = L; const rows = []; for (let i = 0; i < L.length; i += cols) rows.push(Math.max(...L.slice(i, i + cols).map(x => x.h))); this._rows = rows; return rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * 10; },
    draw(d, x, y, w) {
      const cw = (w - (cols - 1) * 10) / cols, lw = cw * 0.46; let yy = y;
      this._rows.forEach((rh, ri) => {
        this._L.slice(ri * cols, ri * cols + cols).forEach((c, i) => {
          const cx = x + i * (cw + 10); d.rect(cx, yy, cw, rh, C.softer, C.line, 4);
          d.text(cx + 9, yy + 7, c.g.title, 8.4, 'bold', C.petrol); let ty = yy + 21;
          c.rows.forEach((r, k) => { const rh2 = Math.max(r.l.length, r.v.length) * 9.6;
            if (k) d.line(cx + 9, ty - 2, cx + cw - 9, ty - 2, '#E4EAED', 0.4);
            r.l.forEach((t, j) => d.text(cx + 9, ty + j * 9.6, t, 7.4, 'normal', C.muted)); r.v.forEach((t, j) => d.text(cx + cw - 9, ty + j * 9.6, t, 8, 'semibold', C.ink, 'right')); ty += rh2 + 3.2; });
        }); yy += rh + 10;
      });
    }
  });
  // Composición: lista con barra, valor y porcentaje (categorías originales, orden por valor).
  const bars = (cards, cols = 2) => ({
    measure(d, w) { const rows = []; for (let i = 0; i < cards.length; i += cols) rows.push(Math.max(...cards.slice(i, i + cols).map(c => 24 + Math.max(1, c.items.length) * 12.5 + (c.note ? 10 : 0)))); this._rows = rows; return rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * 10; },
    draw(d, x, y, w) {
      const cw = (w - (cols - 1) * 10) / cols; let yy = y;
      this._rows.forEach((rh, ri) => {
        cards.slice(ri * cols, ri * cols + cols).forEach((c, i) => {
          const cx = x + i * (cw + 10); d.rect(cx, yy, cw, rh, C.white, C.line, 4); d.text(cx + 9, yy + 7, c.title, 8.4, 'bold', C.petrol);
          if (c.total) d.text(cx + cw - 9, yy + 8, c.total, 7.2, 'semibold', C.muted, 'right');
          const max = Math.max(...c.items.map(t => t.value), 1), lab = cw * 0.34, vw = 92, bw = cw - lab - vw - 24; let ty = yy + 22;
          if (!c.items.length) d.text(cx + 9, ty, c.empty || 'Sin área activa.', 7.4, 'normal', C.muted);
          c.items.forEach(t => { d.text(cx + 9, ty, d.m.wrap(t.label, 7.4, 'normal', lab - 4, 1)[0], 7.4, 'normal', C.text);
            d.rect(cx + 9 + lab, ty + 1.6, bw, 6, C.soft, null, 2); d.rect(cx + 9 + lab, ty + 1.6, Math.max(1, bw * t.value / max), 6, c.color || C.petrol, null, 2);
            d.text(cx + cw - 9 - 36, ty, t.display, 7.4, 'semibold', C.ink, 'right'); d.text(cx + cw - 9, ty, t.pct, 7, 'normal', C.muted, 'right'); ty += 12.5; });
          if (c.note) d.text(cx + 9, ty + 1, c.note, 6.6, 'normal', C.muted);
        }); yy += rh + 10;
      });
    }
  });
  // Gráfico de líneas vectorial: series por zafra, etiquetas de valor y línea de referencia opcional.
  const chart = (o) => ({
    measure() { return o.height || 150; },
    draw(d, x, y, w) {
      const h = o.height || 150; d.rect(x, y, w, h, C.white, C.line, 4); d.text(x + 9, y + 7, o.title, 8.4, 'bold', C.petrol);
      if (o.sub) d.text(x + 9, y + 18, o.sub, 6.8, 'normal', C.muted);
      let lx = x + w - 9; [...o.series].filter(s => s.name).reverse().forEach(s => { const tw = d.m.width(s.name, 6.8, 'normal'); d.text(lx, y + 8, s.name, 6.8, 'normal', C.text, 'right'); lx -= tw + 4; d.line(lx - 12, y + 11.5, lx, y + 11.5, s.color, 2, s.dash); lx -= 20; });
      const all = o.series.flatMap(s => s.values).concat(o.ref != null ? [o.ref] : []).filter(Number.isFinite);
      if (!all.length) { d.text(x + 9, y + 40, 'Sin datos.', 8, 'normal', C.muted); return; }
      let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.14 || Math.abs(hi) * 0.12 || 1; lo = o.zero ? 0 : Math.max(0, lo - pad); hi += pad;
      const pl = x + 42, pr = x + w - 18, pt = y + (o.sub ? 30 : 24), pb = y + h - 20, X = i => pl + (o.labels.length > 1 ? i * (pr - pl) / (o.labels.length - 1) : (pr - pl) / 2), Y = v => pb - (v - lo) * (pb - pt) / (hi - lo || 1);
      for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; d.line(pl, Y(v), pr, Y(v), '#E8EDF0', 0.5); d.text(pl - 5, Y(v) - 3.4, fmt(v, o.axisDigits ?? 0), 6.4, 'normal', C.muted, 'right'); }
      o.labels.forEach((l, i) => d.text(X(i), pb + 5, l, 6.4, 'normal', C.muted, 'center'));
      if (o.ref != null) { d.line(pl, Y(o.ref), pr, Y(o.ref), C.blue, 0.9, [3, 2]); const ly = Y(o.ref) - 9 < pt ? Y(o.ref) + 3 : Y(o.ref) - 9; d.text(pl + 4, ly, o.refLabel, 6.4, 'semibold', C.blue, 'left'); }
      o.series.forEach(s => { const pts = s.values.map((v, i) => Number.isFinite(v) ? [X(i), Y(v)] : null);
        let run = []; pts.forEach(p => { if (p) run.push(p); else { if (run.length > 1) d.poly(run, s.color, 1.6, s.dash); run = []; } }); if (run.length > 1) d.poly(run, s.color, 1.6, s.dash);
        pts.forEach((p, i) => { if (!p) return; d.dot(p[0], p[1], 2.1, s.color); if (o.labelsOn !== false && s.label !== false) d.text(p[0], p[1] - 10.5, fmt(s.values[i], s.digits ?? 2), 6.2, 'semibold', C.ink, 'center'); }); });
    }
  });
  const note = (str, size = 7) => ({
    measure(d, w) { this._l = d.m.wrap(str, size, 'normal', w); return this._l.length * size * 1.35; }, gap: 8,
    draw(d, x, y) { this._l.forEach((l, i) => d.text(x, y + i * size * 1.35, l, size, 'normal', C.muted)); }
  });
  const row = (blocks, gap = 10) => ({ // bloques lado a lado (p. ej. gráficos), misma altura
    measure(d, w) { const cw = (w - (blocks.length - 1) * gap) / blocks.length; this._h = Math.max(...blocks.map(b => b.measure(d, cw))); return this._h; },
    draw(d, x, y, w) { const cw = (w - (blocks.length - 1) * gap) / blocks.length; blocks.forEach((b, i) => b.draw(d, x + i * (cw + gap), y, cw)); }
  });
  // Tabla paginada: encabezado repetido, filas indivisibles, separadores de sección pegados a su primera fila.
  const table = (o) => ({
    measure() { return 0; },
    split(d, w) {
      const fs = o.size || 7.4, lh = fs * 1.28, cols = o.columns, tw = cols.reduce((n, c) => n + (c.w || 1), 0);
      const widths = cols.map(c => w * (c.w || 1) / tw), X = []; widths.reduce((acc, cw, i) => (X[i] = acc, acc + cw), d.page ? M : M);
      const head = cols.map((c, i) => d.m.wrap(c.label, fs - 0.4, 'semibold', widths[i] - 6, 3)), hh = Math.max(...head.map(h => h.length)) * (lh - 0.6) + 7;
      const prep = o.rows.map(r => r.section ? {section: r.section, h: 14} : {cells: r.map((v, i) => d.m.wrap(v ?? '—', fs, cols[i].bold ? 'semibold' : 'normal', widths[i] - 6, cols[i].lines || 3)), raw: r, tone: r.tone});
      prep.forEach(r => { if (!r.section) r.h = Math.max(...r.cells.map(c => c.length)) * lh + 5; });
      const drawHead = () => { const y = d.y; d.rect(M, y, w, hh, C.petrol, null, 0); head.forEach((h, i) => h.forEach((t, j) => d.text(cols[i].align === 'right' ? X[i] + widths[i] - 3 : X[i] + 3, y + 3.5 + j * (lh - 0.6), t, fs - 0.4, 'semibold', C.white, cols[i].align === 'right' ? 'right' : 'left'))); d.y += hh; };
      if (o.title) { const t = heading(o.title, o.sub, 0); const th = t.measure(d); if (!d.space(th + hh + (prep[0]?.h || 0) * 3) && d.y > d.pageTop() + 1) d.newPage(); t.draw(d, M, d.y, w); d.y += th + 6; }
      else if (!d.space(hh + (prep[0]?.h || 0) * 3) && d.y > d.pageTop() + 1) d.newPage();
      drawHead(); let zebra = 0;
      prep.forEach((r, k) => {
        const nextH = r.section ? (prep[k + 1]?.h || 0) : 0;
        if (!d.space(r.h + nextH)) { d.newPage(); if (o.title) { d.text(M, d.y, o.title + ' (continuación)', 8, 'semibold', C.muted); d.y += 13; } drawHead(); zebra = 0; }
        const y = d.y;
        if (r.section) { d.rect(M, y, w, r.h, C.section, null, 0); d.text(M + 4, y + 3.6, r.section, fs, 'bold', C.ink); d.y += r.h; zebra = 0; return; }
        if (zebra++ % 2) d.rect(M, y, w, r.h, C.zebra, null, 0);
        r.cells.forEach((lines, i) => { const c = cols[i], color = (c.tone && r.raw.tone?.[i]) || (c.color) || C.text;
          lines.forEach((t, j) => d.text(c.align === 'right' ? X[i] + widths[i] - 3 : X[i] + 3, y + 2.8 + j * lh, t, fs, c.bold ? 'semibold' : 'normal', color, c.align === 'right' ? 'right' : 'left')); });
        d.line(M, y + r.h, M + w, y + r.h, '#E6EBEE', 0.4); d.y += r.h;
      });
      if (o.total) { const y = d.y; if (!d.space(16)) d.newPage(); const yy = d.y; d.rect(M, yy, w, 15, C.section, null, 0);
        o.total.forEach((v, i) => { if (v == null) return; d.text(cols[i].align === 'right' ? X[i] + widths[i] - 3 : X[i] + 3, yy + 3.8, v, fs, 'bold', C.ink, cols[i].align === 'right' ? 'right' : 'left'); }); d.y += 15; void y; }
      d.y += 10;
    }
  });

  // ---------- salidas ----------
  function toPdf(doc) {
    const pdf = newPdf(doc.A, doc.pages[0].orientation);
    doc.pages.forEach((p, i) => {
      if (i) pdf.addPage('letter', p.orientation);
      p.ops.forEach(o => {
        if (o.t === 'text') { pdf.setFont(FONT, o.weight); pdf.setFontSize(o.size); pdf.setTextColor(o.color); pdf.text(o.str, o.x, o.y, {align: o.align, baseline: 'alphabetic'}); }
        else if (o.t === 'rect') { if (o.fill) pdf.setFillColor(o.fill); if (o.stroke) { pdf.setDrawColor(o.stroke); pdf.setLineWidth(o.lw); } const mode = o.fill && o.stroke ? 'FD' : o.fill ? 'F' : 'S'; o.r ? pdf.roundedRect(o.x, o.y, o.w, o.h, o.r, o.r, mode) : pdf.rect(o.x, o.y, o.w, o.h, mode); }
        else if (o.t === 'line') { pdf.setDrawColor(o.color); pdf.setLineWidth(o.lw); pdf.setLineDashPattern(o.dash || [], 0); pdf.line(o.x1, o.y1, o.x2, o.y2); pdf.setLineDashPattern([], 0); }
        else if (o.t === 'poly') { pdf.setDrawColor(o.color); pdf.setLineWidth(o.lw); pdf.setLineDashPattern(o.dash || [], 0); pdf.setLineJoin('round'); for (let k = 1; k < o.pts.length; k++) pdf.line(o.pts[k - 1][0], o.pts[k - 1][1], o.pts[k][0], o.pts[k][1]); pdf.setLineDashPattern([], 0); }
        else if (o.t === 'dot') { pdf.setFillColor(o.color); pdf.circle(o.x, o.y, o.r, 'F'); }
        else if (o.t === 'img' && doc.A.logo) pdf.addImage(doc.A.logo.url, 'PNG', o.x, o.y, o.w, o.h, 'logo', 'FAST');
      });
    });
    pdf.setProperties({title: doc.meta.title + ' · ' + doc.meta.subject, subject: doc.meta.footer, author: 'Negocios de Caña · CASUR', creator: 'Maestro de Suertes · motor de informes R2'});
    return pdf.output('blob');
  }
  function pngScale(pages) {
    const w = Math.max(...pages.map(p => p.w)), h = pages.reduce((n, p) => n + p.h, 0) + (pages.length - 1) * 16;
    return {w, h, s: Math.max(0.75, Math.min(2.5, PNG_MAX_SIDE / h, PNG_MAX_SIDE / w, Math.sqrt(PNG_MAX_AREA / (w * h))))};
  }
  async function toPng(doc) {
    const {w, h, s} = pngScale(doc.pages), cv = document.createElement('canvas'); cv.width = Math.round(w * s); cv.height = Math.round(h * s);
    const g = cv.getContext('2d', {alpha: false}); g.fillStyle = '#C9D2D7'; g.fillRect(0, 0, cv.width, cv.height); g.scale(s, s);
    const weight = {normal: 400, semibold: 600, bold: 700}; let oy = 0;
    for (const p of doc.pages) {
      const ox = (w - p.w) / 2; g.save(); g.translate(ox, oy); g.fillStyle = '#fff'; g.fillRect(0, 0, p.w, p.h); g.lineCap = 'round'; g.lineJoin = 'round';
      for (const o of p.ops) {
        if (o.t === 'text') { g.font = weight[o.weight] + ' ' + o.size + 'px "' + CANVAS_FONT + '", Arial, sans-serif'; g.fillStyle = o.color; g.textAlign = o.align; g.textBaseline = 'alphabetic'; g.fillText(o.str, o.x, o.y); }
        else if (o.t === 'rect') { g.beginPath(); o.r && g.roundRect ? g.roundRect(o.x, o.y, o.w, o.h, o.r) : g.rect(o.x, o.y, o.w, o.h); if (o.fill) { g.fillStyle = o.fill; g.fill(); } if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = o.lw; g.stroke(); } }
        else if (o.t === 'line' || o.t === 'poly') { g.beginPath(); g.setLineDash(o.dash || []); g.strokeStyle = o.color; g.lineWidth = o.lw; const pts = o.t === 'line' ? [[o.x1, o.y1], [o.x2, o.y2]] : o.pts; pts.forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.stroke(); g.setLineDash([]); }
        else if (o.t === 'dot') { g.beginPath(); g.arc(o.x, o.y, o.r, 0, Math.PI * 2); g.fillStyle = o.color; g.fill(); }
        else if (o.t === 'img' && doc.A.logo?.bmp) g.drawImage(doc.A.logo.bmp, o.x, o.y, o.w, o.h);
      }
      g.restore(); oy += p.h + 16;
    }
    const blob = await new Promise((ok, ko) => cv.toBlob(b => b ? ok(b) : ko(new Error('No se pudo generar la imagen PNG.')), 'image/png'));
    const size = {width: cv.width, height: cv.height, scale: s}; cv.width = cv.height = 1; return {blob, size};
  }

  // ---------- utilidades de datos ----------
  const fmt = (v, d = 2) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('en-US', {minimumFractionDigits: d, maximumFractionDigits: d});
  const date = iso => iso ? window.CASUR_CRONO_PARTICIPATION.formatDate(iso) : '—';
  const now = () => { const n = new Date(); return date(n.toLocaleDateString('sv-SE')) + ' · ' + n.toLocaleTimeString('es-NI', {hour: '2-digit', minute: '2-digit'}); };
  const zlabel = z => String(z).padStart(4, '0').replace(/(..)(..)/, '$1/$2');
  const cellText = c => (c?.innerText ?? c?.textContent ?? '').replace(/\s+/g, ' ').trim();
  const kpiLabel = k => { const l = k.querySelector('.label') || k.querySelector('span'); if (!l) return ''; const own = [...l.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim(); return (own || cellText(l)).replace(/\s*\?$/, ''); };
  const panelKpis = root => Object.fromEntries([...root.querySelectorAll('.kpis .kpi')].map(k => [kpiLabel(k), {value: cellText(k.querySelector('strong')), note: cellText(k.querySelector('em,small'))}]));
  const officialTable = (root, sel = '.table-wrap table') => { const t = root.querySelector(sel); if (!t) return null; const heads = [...t.querySelectorAll('thead th')].map(cellText); return {heads, rows: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(cellText)), nodes: [...t.querySelectorAll('tbody tr')]}; };
  const metaLines = () => { const m = window.CRONO_DATA?.meta || {}; return ['Aforo ' + date(m.tchEst2627EffectiveDate) + ' · Consolidado ' + date(m.generated) + ' · Generación ' + (m.dataVersion || 'N/D')]; };
  const histLines = () => { const h = window.APP_DATA?.meta || {}, z = h.zafras || []; return ['Histórico · zafras ' + (z[0]?.label || '—') + ' a ' + (h.latestLabel || '—') + ' · Fuente ' + (h.source || 'N/D') + ' · sin Maquila']; };
  const ageOf = r => { // misma regla que ageMonths() del Cronológico (index.html): base = el más reciente entre último corte y siembra.
    if (r?.renovacion && !r.fSiembra) return 0; const iso = v => v ? new Date(String(v) + 'T00:00:00') : null, c = iso(r.fUltCte), s = iso(r.fSiembra), f = iso(r.fBase);
    const b = c && s ? (s > c ? s : c) : (s || c || f); if (!b) return null; const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.max(0, (t - b) / 86400000 / 30.4375); };

  window.CASUR_REPORT_ENGINE = Object.freeze({assets, Doc, C, M, heading, kpis, groups, bars, chart, note, row, table, toPdf, toPng, pngScale, fmt, date, now, zlabel, cellText, kpiLabel, panelKpis, officialTable, metaLines, histLines, ageOf, PNG_MAX_SIDE, PNG_MAX_AREA});
})();
