const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Load tool definitions + helpers from src/app.js (everything before the DOM/UI section), same as build.py does.
function loadApp() {
  const src = read('src/app.js');
  const ctx = { window: {}, atob, btoa, URL, URLSearchParams, document: { createElement: () => ({ set innerHTML(v) { this._v = v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }, get value() { return this._v; } }) } };
  vm.createContext(ctx);
  vm.runInContext(src.slice(0, src.indexOf('const BB=')) + ';this.R=ROLES_CONFIG;this.fn={enN,arN,pc,hex,hsl,cr,pcsv,csvq,money,words,md,tw};', ctx);
  return ctx;
}
const tools = () => loadApp().R.flatMap((r, ri) => r.tools.map((t, ti) => ({ ...t, ri, ti })));
const pages = () => tools().map(t => ({ t, path: require('path').join(ROOT, slug(t.n), 'index.html') }));
const SLUG = { 'Tafqeet (Number to Words)': 'tafqeet-arabic-number-to-words' };
const slug = n => SLUG[n] || n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
module.exports = { ROOT, read, loadApp, tools, pages, slug };
