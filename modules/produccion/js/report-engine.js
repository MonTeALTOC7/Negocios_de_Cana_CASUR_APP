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
    shape(rings, fill, stroke, lw = 0.8) { this.op({t: 'shape', rings, fill, stroke, lw}); }
    header(p, first) {
      const x = M, w = p.w - 2 * M, meta = this.meta, A = this.A;
      if (first) {
        let tx = x;
        if (A.logo) { const lh = 44, lw = lh * A.logo.w / A.logo.h; this.op({t: 'img', x, y: M - 4, w: lw, h: lh}); tx = x + lw + 12; }
        this.text(tx, M - 2, meta.title, 15, 'bold', C.ink);
        this.text(tx, M + 17, meta.subject, 10.5, 'semibold', C.petrol);
        let my = M + 31; (meta.lines || []).forEach(l => { this.text(tx, my, l, 7.3, 'normal', C.muted); my += 9.2; });
        // Encabezado uniforme aprobado (todos los exportadores): marca y fecha de consulta a la derecha.
        this.text(x + w, M - 1, 'Negocios de Caña · CASUR', 7.6, 'semibold', C.petrol, 'right');
        this.text(x + w, M + 9.5, 'Consulta: ' + meta.consulta, 7.3, 'normal', C.muted, 'right');
        const yy = Math.max(M + 44, my + 2); this.line(x, yy, x + w, yy, C.petrol, 1.2); return yy + 12;
      }
      this.text(x, M - 6, meta.title + ' · ' + meta.subject, 7.8, 'semibold', C.ink);
      this.line(x, M + 6, x + w, M + 6, C.petrol, 0.8); return M + 14;
    }
    footers() {
      const n = this.pages.length;
      this.pages.forEach((p, i) => {
        const y = p.h - M - 8; p.ops.push({t: 'line', x1: M, y1: y, x2: p.w - M, y2: y, color: C.line, lw: 0.6});
        p.ops.push({t: 'text', x: M, y: y + 5 + 7 * 0.82, str: 'Negocios de Caña · CASUR', size: 6.8, weight: 'normal', color: C.muted, align: 'left'});
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
        else if (o.t === 'shape') { const xs = o.rings.flat().map(p => p[0]), ys = o.rings.flat().map(p => p[1]); x1 = Math.min(...xs); x2 = Math.max(...xs); y1 = Math.min(...ys); y2 = Math.max(...ys); }
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
  // KPI ejecutivo: etiqueta, valor y unidad; sin textos explicativos. compact = fila complementaria de menor jerarquía.
  const kpis = (list, cols = list.length, compact = false) => { const items = list.map(k => /^(—|N\/D)?$/.test(String(k.value ?? '').trim()) ? {...k, value: k.value || '—', unit: ''} : k); return {
    gap: compact ? 12 : 8,
    measure(d, w) { if (compact) return 20; const cw = (w - (cols - 1) * 8) / cols; this._r = items.map(it => ({...it, lab: d.m.wrap(it.label, compact ? 6.9 : 7.2, 'semibold', cw - 16, 2)})); const L = Math.max(...this._r.map(x => x.lab.length));
      this._h = compact ? 13 + L * 8.2 + 2 : 11 + L * 8.6 + 22; const rows = Math.ceil(items.length / cols); return rows * this._h + (rows - 1) * 8; },
    draw(d, x, y, w) {
      if (compact) { let cx = x + 10; d.rect(x, y, w, 20, null, C.line, 4, 0.5);
        items.forEach((k, i) => { if (i) { d.line(cx - 12, y + 5, cx - 12, y + 15, C.line, 0.6); }
          d.text(cx, y + 6.6, k.label, 7.2, 'semibold', C.muted); cx += d.m.width(k.label, 7.2, 'semibold') + 7; d.text(cx, y + 5, k.value, 9.6, 'bold', C.ink); cx += d.m.width(k.value, 9.6, 'bold') + 3;
          if (k.unit) { d.text(cx, y + 6.6, k.unit, 7.2, 'semibold', C.muted); cx += d.m.width(k.unit, 7.2, 'semibold'); } cx += 24; }); return; }
      const cw = (w - (cols - 1) * 8) / cols;
      this._r.forEach((k, n) => { const cx = x + (n % cols) * (cw + 8), yy = y + Math.floor(n / cols) * (this._h + 8);
        d.rect(cx, yy, cw, this._h, C.soft, null, 4); d.rect(cx, yy + 6, 2.4, this._h - 12, k.accent || C.petrol, null, 0);
        let ty = yy + 9; k.lab.forEach(l => { d.text(cx + 10, ty, l, 7.2, 'semibold', C.muted); ty += 8.6; });
        d.text(cx + 10, ty + 2, k.value, 15, 'bold', C.ink); if (k.unit) d.text(cx + 10 + d.m.width(k.value, 15, 'bold') + 3, ty + 7.4, k.unit, 7.5, 'semibold', C.muted); });
    }
  }; };
  // Fichas de variables: columnas de tarjetas apiladas (etiqueta / valor). La última tarjeta de cada columna se estira
  // para igualar la altura de la columna más alta (sin huecos).
  const groups = (columns) => ({
    measure(d, w) {
      const cw = (w - (columns.length - 1) * 10) / columns.length, lw = cw * 0.5, vw = cw - lw - 18;
      this._C = columns.map(col => col.filter(Boolean).map(g => { const rows = g.items.filter(Boolean).map(([l, v]) => ({l: d.m.wrap(l, 7.4, 'normal', lw, 2), v: d.m.wrap(v ?? '—', 8, 'semibold', vw, 3)}));
        return {g, rows, h: 22 + rows.reduce((n, r) => n + Math.max(r.l.length, r.v.length) * 9.6 + 3.4, 0) + 3}; }));
      this._H = Math.max(...this._C.map(c => c.reduce((n, x) => n + x.h, 0) + (c.length - 1) * 8)); return this._H;
    },
    draw(d, x, y, w) {
      const cw = (w - (columns.length - 1) * 10) / columns.length;
      this._C.forEach((col, ci) => { const cx = x + ci * (cw + 10); let yy = y, used = col.reduce((n, c) => n + c.h, 0) + (col.length - 1) * 8;
        col.forEach((c, k) => { const h = c.h + (k === col.length - 1 ? this._H - used : 0); d.rect(cx, yy, cw, h, C.softer, null, 4);
          d.text(cx + 9, yy + 7, c.g.title, 8.4, 'bold', C.petrol); let ty = yy + 22;
          c.rows.forEach((r, j) => { const rh = Math.max(r.l.length, r.v.length) * 9.6; if (j) d.line(cx + 9, ty - 2.2, cx + cw - 9, ty - 2.2, '#E4EAED', 0.4);
            r.l.forEach((t, i) => d.text(cx + 9, ty + i * 9.6, t, 7.4, 'normal', C.muted)); r.v.forEach((t, i) => d.text(cx + cw - 9, ty + i * 9.6, t, 8, 'semibold', C.ink, 'right')); ty += rh + 3.4; });
          yy += h + 8; }); });
    }
  });
  // Composición (diseño de Análisis por Zona): una barra horizontal apilada con los porcentajes reales del total y filas
  // compactas alineadas (color · categoría · valor · %). Total en el encabezado de la tarjeta; altura adaptable.
  const SEQ = ['#1F4E5C', '#3491b7', '#5B8E7D', '#8FB8A8', '#7C6A9E', '#86A0AA', '#D4B35F', '#B8C5CC'], OTHER = '#C9CED4';
  const RIEGO = {Gravedad: '#1F4E5C', Goteo: '#3491b7', Aspersion: '#5B8E7D', 'Mini-Aspersion': '#8FB8A8', Pivote: '#7C6A9E', Ventana: '#86A0AA', Secano: '#D4B35F'};
  const composition = (cards, cols = 2) => ({
    measure(d) { const rows = []; for (let i = 0; i < cards.length; i += cols) rows.push(Math.max(...cards.slice(i, i + cols).map(c => 38 + Math.max(1, c.items.length) * 11.2 + 4))); this._rows = rows; return rows.reduce((a, b) => a + b, 0) + (rows.length - 1) * 10; },
    draw(d, x, y, w) {
      const cw = (w - (cols - 1) * 10) / cols; let yy = y;
      this._rows.forEach((rh, ri) => {
        cards.slice(ri * cols, ri * cols + cols).forEach((c, i) => {
          const cx = x + i * (cw + 10), bx = cx + 9, bw = cw - 18, tot = c.items.reduce((n, t) => n + t.value, 0);
          d.rect(cx, yy, cw, rh, C.softer, null, 4); d.text(bx, yy + 7, c.title, 8.4, 'bold', C.petrol); if (c.total) d.text(cx + cw - 9, yy + 8, c.total, 7.4, 'semibold', C.ink, 'right');
          if (!c.items.length || !(tot > 0)) { d.text(bx, yy + 24, c.empty || 'Sin área activa.', 7.4, 'normal', C.muted); return; }
          let sx = bx; c.items.forEach((t, k) => { const sw = bw * t.value / tot; d.rect(sx, yy + 21, Math.max(0.4, sw - (k < c.items.length - 1 ? 0.8 : 0)), 8, t.color, null, 0); sx += sw; });
          let ty = yy + 36; c.items.forEach(t => { d.rect(bx, ty + 1.2, 6, 6, t.color, null, 1); d.text(bx + 10, ty, d.m.wrap(t.label, 7.4, 'normal', bw - 120, 1)[0], 7.4, 'normal', C.text);
            d.text(cx + cw - 52, ty, t.display, 7.4, 'semibold', C.ink, 'right'); d.text(cx + cw - 9, ty, t.pct, 7.2, 'normal', C.muted, 'right'); ty += 11.2; });
        }); yy += rh + 10;
      });
    }
  });
  // Gráfico de líneas vectorial: zafras completas en el eje, cuadrícula discreta, puntos con anillo blanco, etiquetas de
  // valor por encima o por debajo del punto según la pendiente (sin superponerse a la línea) y promedio rotulado al final.
  const chart = (o) => ({
    measure() { return o.height || 150; },
    draw(d, x, y, w) {
      const h = o.height || 150; d.rect(x, y, w, h, C.white, C.line, 4, 0.5); d.text(x + 10, y + 8, o.title, 8.6, 'bold', C.petrol);
      const all = o.series.flatMap(s => s.values).concat(o.ref != null ? [o.ref] : []).filter(Number.isFinite);
      if (!all.length) { d.text(x + 10, y + 40, 'Sin datos.', 8, 'normal', C.muted); return; }
      let lo = Math.min(...all), hi = Math.max(...all); const pad = (hi - lo) * 0.18 || Math.abs(hi) * 0.12 || 1; lo = Math.max(0, lo - pad); hi += pad;
      const refW = o.ref != null ? Math.max(d.m.width(o.refLabel, 6.6, 'semibold'), 30) + 10 : 0;
      const pl = x + 40, pr = x + w - 16 - refW, pt = y + 30, pb = y + h - 20, n = o.labels.length;
      const X = i => pl + 10 + (n > 1 ? i * (pr - pl - 20) / (n - 1) : (pr - pl - 20) / 2), Y = v => pb - (v - lo) * (pb - pt) / (hi - lo || 1);
      // Zafras seleccionadas: banda tenue detrás de los puntos del período (el resto es el histórico completo).
      if (o.highlight?.length && o.highlight.length < n) { const step = n > 1 ? (pr - pl - 20) / (n - 1) : 0; o.highlight.forEach(i => d.rect(X(i) - step / 2, pt - 6, step, pb - pt + 6, '#EAF2F5', null, 0)); }
      for (let k = 0; k <= 4; k++) { const v = lo + (hi - lo) * k / 4; d.line(pl, Y(v), pr, Y(v), k ? '#EEF2F4' : '#D9E0E4', k ? 0.5 : 0.7); d.text(pl - 6, Y(v) - 3.2, fmt(v, o.axisDigits ?? 0), 6.4, 'normal', C.muted, 'right'); }
      o.labels.forEach((l, i) => d.text(X(i), pb + 6, l, 6.6, o.highlight?.includes(i) && o.highlight.length < n ? 'semibold' : 'normal', o.highlight?.includes(i) && o.highlight.length < n ? C.ink : C.text, 'center'));
      if (o.ref != null) { d.line(pl, Y(o.ref), pr, Y(o.ref), C.gold, 0.9, [3, 2]); d.text(pr + 6, Y(o.ref) - 3.4, o.refLabel, 6.6, 'semibold', '#8A6A12', 'left'); }
      o.series.forEach(s => { const pts = s.values.map((v, i) => Number.isFinite(v) ? [X(i), Y(v)] : null);
        let run = []; pts.forEach(p => { if (p) run.push(p); else { if (run.length > 1) d.poly(run, s.color, 1.7, s.dash); run = []; } }); if (run.length > 1) d.poly(run, s.color, 1.7, s.dash);
        pts.forEach((p, i) => { if (!p) return; d.dot(p[0], p[1], 3.3, C.white); d.dot(p[0], p[1], 2.3, s.color);
          // Etiqueta en el cuadrante libre de la línea: valle → debajo; pico → encima; subida → arriba a la izquierda;
          // bajada → arriba a la derecha. Se corrige hacia dentro del área del gráfico.
          const v = s.values[i], a = s.values[i - 1], b = s.values[i + 1], fa = Number.isFinite(a), fb = Number.isFinite(b);
          const valley = (!fa || a > v) && (!fb || b > v) && (fa || fb), up = fa && fb && a < v && v < b, down = fa && fb && a > v && v > b;
          let lx = p[0], ly = valley ? p[1] + 5.5 : p[1] - 13, al = 'center';
          if (up) { lx = p[0] - 5; ly = p[1] - 11; al = 'right'; } else if (down) { lx = p[0] + 5; ly = p[1] - 11; al = 'left'; }
          if (ly < pt - 10) ly = p[1] + 5.5; if (ly + 7 > pb) ly = p[1] - 13;
          // Fondo blanco bajo la etiqueta: se lee limpia aunque la cruce la línea de referencia o la cuadrícula.
          const lab = fmt(v, s.digits ?? 2), lw = d.m.width(lab, 6.6, 'semibold'), bx = al === 'center' ? lx - lw / 2 : al === 'right' ? lx - lw : lx;
          d.rect(bx - 1.6, ly - 1.2, lw + 3.2, 8.2, C.white, null, 1.5); d.text(lx, ly, lab, 6.6, 'semibold', C.ink, al); }); });
    }
  });
  // Selección informada: fichas con color (el mismo del mapa), nombre en negrita y detalle breve; se reparten en filas.
  const tint = (hex, a) => { const n = parseInt(hex.slice(1), 16), m = c => Math.round(255 - (255 - c) * a); return '#' + [m(n >> 16 & 255), m(n >> 8 & 255), m(n & 255)].map(v => v.toString(16).padStart(2, '0')).join(''); };
  const chips = (label, items, perRow = 3) => ({
    gap: 10,
    measure(d, w) { this._lh = label ? 14 : 0; this._rows = Math.ceil(items.length / perRow); return this._lh + this._rows * 34 + (this._rows - 1) * 6; },
    draw(d, x, y, w) { if (label) d.text(x, y, label, 7.4, 'semibold', C.muted);
      const n = Math.min(perRow, items.length), cw = (w - (n - 1) * 8) / n;
      items.forEach((it, i) => { const cx = x + (i % perRow) * (cw + 8), cy = y + this._lh + Math.floor(i / perRow) * 40;
        d.rect(cx, cy, cw, 34, tint(it.color, 0.08), tint(it.color, 0.5), 4, 0.6); d.rect(cx, cy, 5, 34, it.color, null, 0);
        d.text(cx + 13, cy + 6, d.m.wrap(it.title, 9, 'bold', cw - 20, 1)[0], 9, 'bold', C.ink); if (it.sub) d.text(cx + 13, cy + 19, d.m.wrap(it.sub, 7.2, 'normal', cw - 20, 1)[0], 7.2, 'normal', C.text); }); }
  });
  // Bloque de período: banda con título y descripción, seguida de sus KPI (histórico completo / zafras seleccionadas).
  const band = (title, sub, color) => ({ gap: 6,
    measure() { return 18; },
    draw(d, x, y, w) { d.rect(x, y, w, 18, tint(color, 0.12), null, 3); d.rect(x, y, 3, 18, color, null, 0); d.text(x + 10, y + 5, title, 8.4, 'bold', C.ink); if (sub) d.text(x + 14 + d.m.width(title, 8.4, 'bold'), y + 5.6, sub, 7.6, 'normal', C.text); } });
  // Mapa vectorial: polígonos (Web Mercator local, misma escala en ambos ejes) con relleno tenue del color de la finca y
  // contorno nítido; contexto en gris; rótulos solo con el número de suerte, sin caja, omitidos si chocarían con otro.
  const map = (o) => ({
    measure(d, w) { const pts = o.shapes.flatMap(s => s.rings.flat()); if (!pts.length) return 0; const rad = Math.PI / 180, P = p => [p[0] * rad, Math.log(Math.tan(Math.PI / 4 + p[1] * rad / 2))];
      const xy = pts.map(P), xs = xy.map(p => p[0]), ys = xy.map(p => p[1]); this._b = {minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys), P};
      // fit: ocupa el espacio que queda en la página si alcanza (≥ minHeight); si no, el bloque pasa a la página siguiente.
      const room = d.bottom - d.y - 2, maxH = o.fit && room >= (o.minHeight || 190) ? Math.min(o.maxHeight || 560, room) : (o.maxHeight || 420);
      const aspect = (this._b.maxY - this._b.minY) / Math.max(1e-12, this._b.maxX - this._b.minX); this._h = Math.max(150, Math.min(maxH, (w - 24) * aspect + 24 + (o.title ? 18 : 0))); return this._h; },
    draw(d, x, y, w) {
      const {minX, maxX, minY, maxY, P} = this._b, top = y + (o.title ? 18 : 0), ih = this._h - (o.title ? 18 : 0) - 24, iw = w - 24, sc = Math.min(iw / Math.max(1e-12, maxX - minX), ih / Math.max(1e-12, maxY - minY));
      const ox = x + 12 + (iw - (maxX - minX) * sc) / 2, oy = top + 12 + (ih - (maxY - minY) * sc) / 2, T = p => { const q = P(p); return [ox + (q[0] - minX) * sc, oy + (maxY - q[1]) * sc]; };
      if (o.title) d.text(x, y, o.title, 8.6, 'bold', C.petrol);
      d.rect(x, top, w, this._h - (o.title ? 18 : 0), '#F7F9FA', C.line, 4, 0.5);
      // Contornos finos y tintados: las suertes vienen fragmentadas por surcos y un trazo oscuro saturaría el mapa.
      [...o.shapes].sort((a, b) => (a.context ? 0 : 1) - (b.context ? 0 : 1)).forEach(s => d.shape(s.rings.map(r => r.map(T)), s.context ? '#FFFFFF' : tint(s.color, s.strong ? 0.55 : 0.3), s.context ? '#C3CCD1' : s.strong ? s.color : tint(s.color, 0.62), s.context ? 0.3 : s.strong ? 0.6 : 0.35));
      const placed = [], fs = o.labelSize || 6.4, texts = []; let shown = 0;
      o.labels.forEach(l => { const [lx, ly] = T(l.at), tw = d.m.width(l.text, fs, 'semibold'), b = {x: lx - tw / 2 - 1, y: ly - fs / 2 - 1, w: tw + 2, h: fs + 2};
        if (placed.some(a => b.x < a.x + a.w && b.x + b.w > a.x && b.y < a.y + a.h && b.y + b.h > a.y)) return; placed.push(b); shown++; texts.push(l.text); d.text(lx, ly - fs * 0.5, l.text, fs, 'semibold', C.ink, 'center'); });
      this.stats = {shapes: o.shapes.length, labels: o.labels.length, shown, overlaps: 0, texts};
      if (o.onDraw) o.onDraw(this.stats);
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
      // Tabla corta (cabe en menos de la mitad de una página): se mantiene entera; si no cabe aquí, empieza en la siguiente.
      const whole = (o.title ? 20 : 0) + hh + prep.reduce((n, r) => n + r.h, 0) + (o.total ? 16 : 0);
      if (whole < (d.page.h - 2 * M - FOOT) * 0.5 && !d.space(whole) && d.y > d.pageTop() + 1) d.newPage();
      if (o.title) { const t = heading(o.title, o.sub, 0); const th = t.measure(d); if (!d.space(th + hh + (prep[0]?.h || 0) * 3) && d.y > d.pageTop() + 1) d.newPage(); t.draw(d, M, d.y, w); d.y += th + 6; }
      else if (!d.space(hh + (prep[0]?.h || 0) * 3) && d.y > d.pageTop() + 1) d.newPage();
      drawHead(); let zebra = 0;
      prep.forEach((r, k) => {
        // Un separador viaja con su primera fila y la última fila con el total: nunca quedan solos al pie o al inicio de página.
        const nextH = r.section ? (prep[k + 1]?.h || 0) : (k === prep.length - 1 && o.total ? 16 : 0);
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
        else if (o.t === 'shape') { pdf.setLineJoin('round'); if (o.fill) pdf.setFillColor(o.fill); if (o.stroke) { pdf.setDrawColor(o.stroke); pdf.setLineWidth(o.lw); }
          pdf.path(o.rings.flatMap(r => [...r.map((q, k) => ({op: k ? 'l' : 'm', c: [q[0], q[1]]})), {op: 'h', c: []}]));
          o.fill && o.stroke ? pdf.fillStrokeEvenOdd() : o.fill ? pdf.fillEvenOdd() : pdf.stroke(); }
        else if (o.t === 'dot') { pdf.setFillColor(o.color); pdf.circle(o.x, o.y, o.r, 'F'); }
        else if (o.t === 'img' && doc.A.logo) pdf.addImage(doc.A.logo.url, 'PNG', o.x, o.y, o.w, o.h, 'logo', 'FAST');
      });
    });
    pdf.setProperties({title: doc.meta.title + ' · ' + doc.meta.subject, author: 'Negocios de Caña · CASUR', creator: 'Negocios de Caña · CASUR'});
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
        else if (o.t === 'shape') { g.beginPath(); o.rings.forEach(r => r.forEach((q, k) => k ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]))); g.closePath(); if (o.fill) { g.fillStyle = o.fill; g.fill('evenodd'); } if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = o.lw; g.setLineDash([]); g.stroke(); } }
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
  // Nombre de archivo: Tipo_Finca[_Suerte_NN]_DD-MMM-AAAA (sin tildes ni espacios).
  const fileSafe = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '');
  const fileName = (kind, farm, suerte, ext) => [kind, fileSafe(farm), suerte ? 'Suerte_' + fileSafe(suerte) : null, date(new Date().toLocaleDateString('sv-SE'))].filter(Boolean).join('_') + '.' + ext;
  const ageOf = r => { // misma regla que ageMonths() del Cronológico (index.html): base = el más reciente entre último corte y siembra.
    if (r?.renovacion && !r.fSiembra) return 0; const iso = v => v ? new Date(String(v) + 'T00:00:00') : null, c = iso(r.fUltCte), s = iso(r.fSiembra), f = iso(r.fBase);
    const b = c && s ? (s > c ? s : c) : (s || c || f); if (!b) return null; const n = new Date(), t = new Date(n.getFullYear(), n.getMonth(), n.getDate()); return Math.max(0, (t - b) / 86400000 / 30.4375); };

  window.CASUR_REPORT_ENGINE = Object.freeze({assets, Doc, C, M, SEQ, OTHER, RIEGO, tint, heading, kpis, groups, composition, chips, band, map, chart, note, row, table, toPdf, toPng, pngScale, fmt, date, now, zlabel, cellText, kpiLabel, panelKpis, officialTable, fileName, ageOf, PNG_MAX_SIDE, PNG_MAX_AREA});
})();
