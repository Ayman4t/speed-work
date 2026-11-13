// Real-browser smoke + accessibility + performance-budget checks (needs Playwright; skipped if unavailable).
// Run: NODE_PATH=$(npm root -g) node --test tests/browser.test.js
const test = require('node:test'), assert = require('node:assert/strict'), http = require('http'), fs = require('fs'), path = require('path');
let chromium; try { ({ chromium } = require('playwright')); } catch { }
const { ROOT, tools, slug } = require('./helpers');
const skip = chromium ? false : 'playwright not installed';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.xml': 'application/xml', '.txt': 'text/plain' };
const PATHS = ['/', '/dev-tools/', '/design-tools/', '/finance-tools/', '/creator-tools/', ...tools().map(t => `/${slug(t.n)}/`)];

let server, base, browser;
test.before(async () => {
  if (skip) return;
  server = http.createServer((q, r) => {
    let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
    r.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); r.end(fs.readFileSync(f));
  });
  await new Promise(ok => server.listen(0, '127.0.0.1', ok)); base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();
});
test.after(async () => { if (browser) await browser.close(); if (server) server.close(); });

async function open(p, opts = {}) {
  const ctx = await browser.newContext(opts), page = await ctx.newPage(), errors = [], external = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => m.type() === 'error' && !/net::ERR|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  page.on('request', r => { if (!r.url().startsWith(base) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url()); });
  await page.route(u => !u.href.startsWith(base) && !/^(data|blob):/.test(u.href), r => r.abort());
  await page.goto(base + p, { waitUntil: 'load' });
  return { ctx, page, errors, external };
}

test('every page loads without JS errors and makes no external font requests', { skip }, async () => {
  for (const p of PATHS) {
    const { ctx, page, errors, external } = await open(p);
    assert.deepEqual(errors, [], `${p}: ${errors.join(' | ')}`);
    assert.deepEqual(external.filter(u => !/cdnjs\.cloudflare\.com\/ajax\/libs\/qrcode-generator/.test(u)), [], `${p}: unexpected external requests`);
    if (/^\/[a-z0-9-]+\/$/.test(p) && !p.endsWith('-tools/')) assert.ok(await page.locator('#ws h2').count() > 0, `${p}: workspace did not render`);
    await ctx.close();
  }
});

test('accessibility: names on controls, unique ids, heading order, no horizontal scroll', { skip }, async () => {
  for (const vp of [{ width: 1280, height: 800 }, { width: 375, height: 700 }]) {
    for (const p of PATHS) {
      const { ctx, page } = await open(p, { viewport: vp });
      const r = await page.evaluate(() => {
        const out = { unnamed: [], dupIds: [], headings: [], overflow: document.documentElement.scrollWidth - innerWidth };
        const name = e => (e.getAttribute('aria-label') || e.getAttribute('title') || (e.labels && [...e.labels].map(l => l.textContent).join('')) || e.textContent || '').trim();
        document.querySelectorAll('input:not([type=hidden]),select,textarea,button').forEach(e => { if (!name(e)) out.unnamed.push(e.outerHTML.slice(0, 90)); });
        document.querySelectorAll('a[href]').forEach(e => { if (!(e.textContent.trim() || e.getAttribute('aria-label'))) out.unnamed.push(e.outerHTML.slice(0, 90)); });
        const seen = new Set(); document.querySelectorAll('[id]').forEach(e => { if (seen.has(e.id)) out.dupIds.push(e.id); seen.add(e.id); });
        let prev = 0; document.querySelectorAll('h1,h2,h3,h4').forEach(h => { const l = +h.tagName[1]; if (prev && l > prev + 1) out.headings.push(`${h.tagName} after h${prev}: ${h.textContent.slice(0, 30)}`); prev = l; });
        return out;
      });
      assert.deepEqual(r.unnamed, [], `${p} @${vp.width}: controls without accessible name`);
      assert.deepEqual(r.dupIds, [], `${p} @${vp.width}: duplicate ids`);
      assert.deepEqual(r.headings, [], `${p} @${vp.width}: heading levels skipped`);
      assert.ok(r.overflow <= 1, `${p} @${vp.width}: horizontal overflow ${r.overflow}px`);
      await ctx.close();
    }
  }
});

test('colour contrast of visible text meets WCAG AA (4.5:1 / 3:1 large)', { skip }, async () => {
  const samples = ['/', '/json-formatter/', '/vat-tax-margin/', '/color-contrast/', '/dev-tools/'];
  for (const p of samples) {
    const { ctx, page } = await open(p);
    const bad = await page.evaluate(() => {
      const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
      const bgOf = el => { const stack = []; for (let e = el; e; e = e.parentElement) { if (getComputedStyle(e).backgroundImage !== 'none' && !/^$/.test(getComputedStyle(e).backgroundImage)) return null; const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) { stack.push(c); if (c.a >= .99) break; } } let base = { r: 9, g: 13, b: 22 }; for (const c of stack.reverse()) base = { r: base.r * (1 - c.a) + c.r * c.a, g: base.g * (1 - c.a) + c.g * c.a, b: base.b * (1 - c.a) + c.b * c.a }; return base; };
      const L = ({ r, g, b }) => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4 }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const out = [], seen = new Set();
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; n = w.nextNode();) {
        const el = n.parentElement; if (!n.textContent.trim() || seen.has(el) || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName)) continue; seen.add(el);
        const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || cs.display === 'none' || cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.color === 'rgba(0, 0, 0, 0)') continue;
        const fg = parse(cs.color), bg = bgOf(el); if (!fg || !bg) continue;
        const mix = { r: bg.r * (1 - fg.a) + fg.r * fg.a, g: bg.g * (1 - fg.a) + fg.g * fg.a, b: bg.b * (1 - fg.a) + fg.b * fg.a };
        const a = L(mix), b = L(bg), ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
        const size = parseFloat(cs.fontSize), large = size >= 24 || (size >= 18.66 && +cs.fontWeight >= 700);
        if (ratio < (large ? 3 : 4.5)) out.push(`${ratio.toFixed(2)} ${el.tagName}.${el.className.toString().slice(0, 30)} "${n.textContent.trim().slice(0, 25)}"`);
      }
      return out;
    });
    assert.deepEqual(bad, [], `${p}: low-contrast text`);
    await ctx.close();
  }
});

test('performance budget: small transfer size, few requests, no layout-blocking third parties', { skip }, async () => {
  for (const p of ['/', '/json-formatter/', '/image-squisher/']) {
    const { ctx, page } = await open(p);
    const sizes = [];
    // re-load measuring transfer
    page.on('response', async r => { try { sizes.push([r.url(), (await r.body()).length]); } catch { } });
    await page.reload({ waitUntil: 'load' });
    const total = sizes.reduce((s, [, n]) => s + n, 0);
    assert.ok(sizes.length <= 8, `${p}: ${sizes.length} requests`);
    assert.ok(total < 250 * 1024, `${p}: ${(total / 1024).toFixed(0)} KB uncompressed`);
    await ctx.close();
  }
});

test('keyboard: Ctrl+K opens search and Escape closes it; Tab reaches the skip link first', { skip }, async () => {
  const { ctx, page } = await open('/json-formatter/');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip');
  await page.keyboard.press('Control+k');
  assert.ok(await page.locator('#sq').isVisible());
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#modal').isHidden());
  await ctx.close();
});

test('JSON Formatter works end to end in the browser', { skip }, async () => {
  const { ctx, page } = await open('/json-formatter/');
  await page.fill('#in', '{"a":1,"b":[1,2]}');
  await page.waitForFunction(() => document.querySelector('#out').textContent.includes('"a": 1'));
  assert.match(await page.textContent('#out'), /"b": \[/);
  await ctx.close();
});
