// Structural / SEO checks on the generated static site. Run `python3 build.py` first.
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const { ROOT, read, tools, slug } = require('./helpers');
const BASE = 'https://speedwork.aymanstack.com';
const all = tools();
const html = p => read(p);
const grab = (h, re) => (h.match(re) || [])[1];
const content = JSON.parse(read('src/content.json'));

test('there are 32 tools, 8 per category', () => {
  assert.equal(all.length, 32);
  for (let r = 0; r < 4; r++) assert.equal(all.filter(t => t.ri === r).length, 8);
});

test('every tool page exists with unique title, description and canonical', () => {
  const titles = new Set(), descs = new Set();
  for (const t of all) {
    const h = html(`${slug(t.n)}/index.html`);
    const title = grab(h, /<title>(.*?)<\/title>/), desc = grab(h, /<meta name="description" content="(.*?)"/);
    assert.ok(title && title.length <= 70, `${t.n}: title length`);
    assert.ok(desc && desc.length <= 160, `${t.n}: description ${desc && desc.length} chars`);
    assert.equal(grab(h, /<link rel="canonical" href="(.*?)"/), `${BASE}/${slug(t.n)}/`);
    assert.equal((h.match(/<h1[ >]/g) || []).length, 1, `${t.n}: exactly one h1`);
    assert.ok(!titles.has(title) && !descs.has(desc), `${t.n}: duplicate title/description`);
    titles.add(title); descs.add(desc);
  }
});

test('each tool page carries its own unique About paragraph and tip', () => {
  const abouts = new Set();
  for (const t of all) {
    const h = html(`${slug(t.n)}/index.html`), c = content[t.n];
    assert.ok(c, `${t.n}: missing in src/content.json`);
    const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
    assert.ok(h.includes(esc(c.about)), `${t.n}: about paragraph not rendered`);
    assert.ok(h.includes(`<p class="tip"><strong>Tip:</strong> ${esc(c.tip)}`), `${t.n}: tip not rendered`);
    assert.ok(!abouts.has(c.about)); abouts.add(c.about);
  }
  assert.equal(Object.keys(content).length, 32);
});

test('JSON-LD parses on every page and includes breadcrumbs', () => {
  for (const f of ['index.html', '404.html', ...['dev', 'design', 'finance', 'creator'].map(x => `${x}-tools/index.html`), ...all.map(t => `${slug(t.n)}/index.html`)]) {
    const m = html(f).match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
    assert.ok(m, `${f}: no JSON-LD`);
    const j = JSON.parse(m[1]);
    assert.equal(j['@context'], 'https://schema.org');
    if (!['index.html', '404.html'].includes(f)) assert.ok(j['@graph'].some(n => n['@type'] === 'BreadcrumbList'), `${f}: breadcrumbs`);
  }
});

test('sitemap lists every page exactly once and each URL exists on disk', () => {
  const urls = [...read('sitemap.xml').matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
  assert.equal(urls.length, 37);
  assert.equal(new Set(urls).size, urls.length);
  for (const u of urls) {
    const p = u.replace(BASE, '');
    assert.ok(fs.existsSync(path.join(ROOT, p === '/' ? 'index.html' : p + 'index.html')), `${u} missing on disk`);
  }
  assert.match(read('robots.txt'), /Sitemap: https:\/\/speedwork\.aymanstack\.com\/sitemap\.xml/);
});

test('all internal links and assets resolve', () => {
  const files = ['index.html', '404.html', ...all.map(t => `${slug(t.n)}/index.html`)];
  for (const f of files) {
    for (const m of html(f).matchAll(/(?:href|src)="(\/[^"#?]*)(?:\?[^"]*)?"/g)) {
      const p = m[1];
      const target = p.endsWith('/') ? path.join(ROOT, p, 'index.html') : path.join(ROOT, p);
      assert.ok(fs.existsSync(target), `${f}: broken link ${p}`);
    }
  }
});

test('no third-party font requests (self-contained typography)', () => {
  for (const f of ['index.html', '404.html', 'assets/style.css', 'assets/app.js', ...all.map(t => `${slug(t.n)}/index.html`)]) {
    assert.doesNotMatch(html(f), /fonts\.googleapis|fonts\.gstatic/, f);
  }
});

test('the only third-party script is the QR library, and only on the UTM page', () => {
  for (const t of all) {
    const ext = [...html(`${slug(t.n)}/index.html`).matchAll(/<script[^>]+src="(https?:[^"]+)"/g)].map(m => m[1]);
    if (t.n === 'UTM Builder & QR') assert.deepEqual(ext, ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js']);
    else assert.deepEqual(ext, [], t.n);
  }
});

test('accessibility basics: lang, viewport, skip link, main landmark', () => {
  for (const t of all) {
    const h = html(`${slug(t.n)}/index.html`);
    assert.match(h, /<html lang="en"/); assert.match(h, /name="viewport"/);
    assert.match(h, /class="skip" href="#main"/); assert.match(h, /<main id="main"/);
  }
});
