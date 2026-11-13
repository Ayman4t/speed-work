// Unit tests for the pure tool logic in src/app.js.
const test = require('node:test'), assert = require('node:assert/strict');
const { loadApp } = require('./helpers');
const app = loadApp();
const get = n => app.R.flatMap(r => r.tools).find(t => t.n === n);
const defaults = t => Object.fromEntries((t.c || []).map(c => [c.k, c.v]));
const run = (n, input, o = {}) => { const t = get(n); return t.f(input, { ...defaults(t), ...o }); };
const text = r => typeof r === 'string' ? r : r.t;

test('JSON Formatter: pretty, minify, validate and error position', () => {
  assert.equal(run('JSON Formatter', '{"a":1}'), '{\n  "a": 1\n}');
  assert.equal(run('JSON Formatter', '{ "a" : 1 }', { m: 'minify' }), '{"a":1}');
  assert.match(run('JSON Formatter', '{"a":1}', { m: 'validate' }), /Valid JSON/);
  const bad = run('JSON Formatter', '{"a":1,}');
  assert.match(bad.t, /^❌/); assert.match(bad.h, /<mark>/);
});

test('JWT Decoder: decodes payload and flags expired tokens', () => {
  const b = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const tok = `${b({ alg: 'HS256' })}.${b({ sub: '123', exp: 1700000000 })}.sig`;
  const out = run('JWT Decoder', tok);
  assert.match(out, /"sub": "123"/); assert.match(out, /EXPIRED/); assert.match(out, /2023-11-14/);
  assert.throws(() => run('JWT Decoder', 'nope'), /Not a JWT/);
});

test('Encode / Decode: round-trips Unicode', () => {
  const s = 'Hello wörld & <tags> مرحبا';
  const enc = run('Encode / Decode', s, { m: 'base64 encode' });
  assert.equal(run('Encode / Decode', enc, { m: 'base64 decode' }), s);
  assert.equal(run('Encode / Decode', 'a b&c', { m: 'url encode' }), 'a%20b%26c');
  assert.equal(run('Encode / Decode', '<a>', { m: 'html encode' }), '&#60;a&#62;');
});

test('Tailwind Sorter: dedupes and resolves conflicts (last wins)', () => {
  const out = text(run('Tailwind Sorter', 'flex p-4 p-2 text-lg flex'));
  assert.equal(out.split(/\s+/).filter(c => c === 'flex').length, 1);
  assert.ok(out.includes('p-2') && !out.includes('p-4'));
});

test('Color & Contrast: black on white is 21:1 and passes everything', () => {
  const out = text(run('Color & Contrast', '#000000', { bg: '#ffffff' }));
  assert.match(out, /21\.00:1/); assert.match(out, /AAA text PASS/);
  assert.match(text(run('Color & Contrast', '#777', { bg: '#fff' })), /AA text FAIL/);
  assert.match(text(run('Color & Contrast', 'hsl(0, 100%, 50%)', { bg: '#fff' })), /HEX\s+#ff0000/);
});

test('px ⇄ rem & clamp(): conversion and fluid range', () => {
  const out = run('px ⇄ rem & clamp()', '16\n32');
  assert.match(out, /16px = 1rem/); assert.match(out, /32px = 2rem/); assert.match(out, /clamp\(1rem, .*vw, 2rem\)/);
});

test('Aspect Ratio & Grid: reduces 1920x1080 to 16:9', () => {
  const out = run('Aspect Ratio & Grid', '1920x1080');
  assert.match(out, /Ratio 16:9/); assert.match(out, /aspect-ratio: 16 \/ 9/); assert.match(out, /≈ 389\.33px/);
});

test('CSV ⇄ JSON: both directions, quoted fields, numbers', () => {
  const j = JSON.parse(run('CSV ⇄ JSON', 'name,qty\n"Pen, blue",3\nBook,5'));
  assert.deepEqual(j, [{ name: 'Pen, blue', qty: 3 }, { name: 'Book', qty: 5 }]);
  assert.equal(run('CSV ⇄ JSON', '[{"a":1,"b":"x,y"}]'), 'a,b\n1,"x,y"');
});

test('JSON ⇄ TS / CSV: infers interfaces and flattens to CSV', () => {
  const ts = run('JSON ⇄ TS / CSV', '[{"id":1,"name":"Ali","tags":["a"]}]');
  assert.match(ts, /interface Root/); assert.match(ts, /id: number/); assert.match(ts, /tags: string\[\]/);
  assert.match(run('JSON ⇄ TS / CSV', '[{"id":1,"n":"A"}]', { m: 'csv' }), /^id,n\n1,A$/);
});

test('Tafqeet: English and Arabic wording', () => {
  assert.match(run('Tafqeet (Number to Words)', '1500'), /One thousand, five hundred Egyptian pound/);
  const out = run('Tafqeet (Number to Words)', '12345.50');
  assert.match(out, /Twelve thousand, three hundred and forty-five/); assert.match(out, /and fifty piastre/);
  assert.match(out, /فقط .* لا غير/);
  assert.throws(() => run('Tafqeet (Number to Words)', 'abc'), /Enter a number/);
});

test('VAT, Tax & Margin: 14% on 1000 with cost 600', () => {
  const out = run('VAT, Tax & Margin', '1000');
  assert.match(out, /Net: 1,000\.00/); assert.match(out, /VAT \(14%\): 140\.00/); assert.match(out, /Gross: 1,140\.00/);
  assert.match(out, /Margin: 40\.00%/); assert.match(out, /Markup: 66\.67%/);
  assert.match(run('VAT, Tax & Margin', '1140', { m: 'including VAT' }), /Net: 1,000\.00/);
});

test('List Deduplicator: case-insensitive, trims, counts', () => {
  const out = run('List Deduplicator', 'apple\nBanana\napple \n banana\ncherry');
  assert.match(out, /^apple\nBanana\ncherry/); assert.match(out, /5 rows → 3 unique \(2 duplicates removed\)/);
});

test('Loan & Compound Interest: standard amortisation', () => {
  assert.match(run('Loan & Compound Interest', '', { m: 'loan', p: 100000, r: 12, y: 5 }), /Monthly installment: 2,224\.44/);
  assert.match(run('Loan & Compound Interest', '', { m: 'compound', p: 1000, r: 0, y: 1, pm: 100 }), /Final value: 2,200\.00/);
});

test('Date & Working Days: one calendar week has 5 business days (inclusive)', () => {
  const out = run('Date & Working Days', '', { a: '2026-11-09', b: '2026-11-13' });
  assert.match(out, /Business days \(Mon–Fri, inclusive\): 5/); assert.match(out, /Working hours: 40/);
  assert.match(run('Date & Working Days', '', { a: '2026-11-13', b: '2026-11-09' }), /Calendar days: 4/);
});

test('Invoice Summary: subtotal, tax and total', () => {
  const out = run('Invoice Summary', 'Design work, 2, 1500\nHosting, 1, 300');
  assert.match(out, /Subtotal: 3,300\.00 EGP/); assert.match(out, /Tax \(14%\): 462\.00/); assert.match(out, /TOTAL: 3,762\.00 EGP/);
});

test('Case & Text Cleaner: every mode', () => {
  assert.equal(run('Case & Text Cleaner', 'myVariable_name here', { m: 'snake_case' }), 'my_variable_name_here');
  assert.equal(run('Case & Text Cleaner', 'my variable name', { m: 'camelCase' }), 'myVariableName');
  assert.equal(run('Case & Text Cleaner', 'my variable name', { m: 'kebab-case' }), 'my-variable-name');
  assert.equal(run('Case & Text Cleaner', 'a  b\n\n\nc ', { m: 'clean spaces' }), 'a b\nc');
});

test('Word Counter & Keywords: counts and top keywords', () => {
  const out = run('Word Counter & Keywords', 'Fast tools are great. Fast tools save time!');
  assert.match(out, /Words: 8/); assert.match(out, /Sentences: 2/); assert.match(out, /fast — 2/);
});

test('Slug & Hashtags: Latin and Arabic', () => {
  assert.equal(run('Slug & Hashtags', 'How to Build a Fast Website!'), 'how-to-build-a-fast-website');
  assert.equal(run('Slug & Hashtags', 'كيف تبني موقعًا سريعًا'), 'كيف-تبني-موقعا-سريعا');
  assert.equal(run('Slug & Hashtags', 'fast website, dev tools', { m: 'hashtags' }), '#FastWebsite #DevTools');
});

test('UTM Builder & QR: appends utm parameters', () => {
  const out = run('UTM Builder & QR', 'https://example.com/landing');
  assert.equal(out.t, 'https://example.com/landing?utm_source=newsletter&utm_medium=email&utm_campaign=spring_sale');
  assert.throws(() => run('UTM Builder & QR', 'not a url'));
});

test('Meta & OpenGraph: emits title, canonical and social tags', () => {
  const out = text(run('Meta & OpenGraph', '', { title: 'Hi & bye', desc: 'D', url: 'https://x.com/', img: 'https://x.com/i.png' }));
  assert.match(out, /<title>Hi &amp; bye<\/title>/); assert.match(out, /rel="canonical" href="https:\/\/x\.com\/"/);
  assert.match(out, /og:image/); assert.match(out, /summary_large_image/);
});

test('JSON-LD Schema: FAQ output is valid JSON-LD', () => {
  const out = run('JSON-LD Schema', 'What is it? | A tool.\nFree? | Yes.');
  const j = JSON.parse(out.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, ''));
  assert.equal(j['@type'], 'FAQPage'); assert.equal(j.mainEntity.length, 2); assert.equal(j.mainEntity[0].acceptedAnswer.text, 'A tool.');
});

test('Markdown ⇄ HTML: basics and unsafe links are not linkified', () => {
  const out = text(run('Markdown ⇄ HTML', '# T\n\n**b** [x](https://a.com) [bad](javascript:alert(1))'));
  assert.match(out, /<h1>T<\/h1>/); assert.match(out, /<strong>b<\/strong>/); assert.match(out, /href="https:\/\/a\.com"/);
  assert.doesNotMatch(out, /href="javascript:/i);
});

test('CSV → Markdown / HTML: tables', () => {
  assert.equal(run('CSV → Markdown / HTML', 'a,b\n1,2'), '| a | b |\n| --- | --- |\n| 1 | 2 |');
  assert.match(run('CSV → Markdown / HTML', 'a,b\n<1>,2', { m: 'html' }), /&lt;1&gt;/);
});

test('Diff Checker: marks additions and deletions', () => {
  const out = text(run('Diff Checker', 'one\ntwo\n=====\none\n2'));
  assert.match(out, / one/); assert.match(out, /- two/); assert.match(out, /\+ 2/);
});

test('SVG Optimizer & JSX: strips metadata and camel-cases attributes', () => {
  const out = text(run('SVG Optimizer & JSX', '<svg class="a" stroke-width="2"><!-- c --><title>x</title><path d="M0"/></svg>', { m: 'jsx' }));
  assert.match(out, /className="a"/); assert.match(out, /strokeWidth="2"/); assert.doesNotMatch(out, /<title>|<!--/);
});

test('Minify / Beautify: CSS both ways', () => {
  assert.equal(run('Minify / Beautify', '.a { color : red ; }', { l: 'css', m: 'minify' }), '.a{color:red;}');
  assert.match(run('Minify / Beautify', '.a{color:red;margin:0}', { l: 'css', m: 'beautify' }), /^\.a\{\n  color:red;\n  margin:0\n\}$/);
});

test('Gradient Generator: all three types', () => {
  assert.match(run('Gradient Generator', '').t, /^background: linear-gradient\(135deg/);
  assert.match(run('Gradient Generator', '', { t: 'radial' }).t, /radial-gradient\(circle/);
  assert.match(run('Gradient Generator', '', { t: 'mesh' }).t, /at 20% 20%/);
});

test('Dummy Data Generator: respects count and example.com', () => {
  assert.equal(run('Dummy Data Generator', '', { t: 'emails', n: 5 }).split('\n').length, 5);
  assert.ok(run('Dummy Data Generator', '', { t: 'emails', n: 20 }).split('\n').every(e => e.endsWith('@example.com')));
  assert.equal(JSON.parse(run('Dummy Data Generator', '', { t: 'json rows', n: 3 })).length, 3);
});

test('Regex Tester: matches, groups, replace', () => {
  const o = { pat: '(\\d+)-(?<w>\\w+)', fg: 'on', txt: '12-ab 34-cd', rep: '$<w>:$1' };
  const out = text(run('Regex Tester', '', o));
  assert.match(out, /2 matches/); assert.match(out, /\$1: "12"/); assert.match(out, /\$<w>: "ab"/); assert.match(out, /ab:12 cd:34/);
});
