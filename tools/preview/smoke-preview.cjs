// CASUR · Prueba de navegador de una preview: SHA, generación de datos, fecha efectiva del aforo,
// cabecera «Cron DD-MMM-AAAA», PWA controlada por el Service Worker y reapertura sin conexión.
//   node tools/preview/smoke-preview.cjs <URL app> <sha> <dataVersion> <aforoISO> <generadoISO>
const {chromium} = require('playwright');
const [base, sha, dataVersion, aforo, generated] = process.argv.slice(2);
const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const fmt = iso => `${iso.slice(8, 10)}-${MES[Number(iso.slice(5, 7)) - 1]}-${iso.slice(0, 4)}`;
(async () => {
  const b = await chromium.launch(); const results = [];
  for (const width of [390, 1536]) {
    const ctx = await b.newContext({viewport: {width, height: 900}, isMobile: width < 700, hasTouch: width < 700});
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    const meta = await (await ctx.request.get(base + '__preview.json')).json();
    if (meta.head !== sha) throw Error('SHA distinto en __preview.json');
    await p.goto(base + '#/modulo/produccion', {waitUntil: 'domcontentloaded'});
    const ready = () => p.waitForFunction(() => { const w = document.querySelector('#mFrame')?.contentWindow; return w && w.CASUR_PRODUCTION_READY && w.CRONO_DATA?.meta?.dataVersion; }, null, {timeout: 300000});
    const info = () => p.frames().find(f => f.url().includes('/modules/produccion/')).evaluate(() => ({
      gen: CRONO_DATA.meta.dataVersion, aforo: CRONO_DATA.meta.tchEst2627EffectiveDate,
      header: [...document.querySelectorAll('*')].filter(e => e.children.length === 0 && /^Cron \d/.test(e.textContent)).map(e => e.textContent)[0] || null}));
    await ready(); const online = await info();
    await p.waitForFunction(() => navigator.serviceWorker.controller, null, {timeout: 120000});
    await p.waitForTimeout(3000); await ctx.setOffline(true); await p.reload({waitUntil: 'domcontentloaded'}); await ready();
    const offline = await info();
    for (const [k, v] of Object.entries({online, offline})) {
      if (v.gen !== dataVersion) throw Error(`${width}px ${k}: generación ${v.gen}`);
      if (v.aforo !== aforo) throw Error(`${width}px ${k}: aforo ${v.aforo}`);
      if (v.header !== 'Cron ' + fmt(generated)) throw Error(`${width}px ${k}: cabecera ${v.header}`);
    }
    if (errs.length) throw Error(`${width}px errores de página: ${errs.join(' | ')}`);
    results.push({width, online, offline}); await ctx.close();
  }
  await b.close(); console.log('SMOKE_OK ' + JSON.stringify(results));
})().catch(e => { console.error(e); process.exit(1); });
