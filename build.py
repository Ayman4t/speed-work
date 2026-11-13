#!/usr/bin/env python3
"""SpeedWork static site generator.  Run:  npm install && python3 build.py
Reads tool definitions from src/app.js and writes one crawlable page per tool."""
import json, subprocess, os, re, html, hashlib, datetime, shutil, tempfile
os.chdir(os.path.dirname(os.path.abspath(__file__)))
BASE = 'https://speedwork.aymanstack.com'
BB = ['#22d3ee', '#a855f7', '#fde047', '#fb923c']
E = html.escape
CUR = ' aria-current="page"'  # kept out of f-string expressions: Python < 3.12 forbids backslashes there
HUB = {'dev': 'dev-tools', 'design': 'design-tools', 'finance': 'finance-tools', 'creator': 'creator-tools'}
CAT = {'dev': 'DeveloperApplication', 'design': 'DesignApplication', 'finance': 'FinanceApplication', 'creator': 'BusinessApplication'}
LABEL = {'dev': 'Developer Tools', 'design': 'Design Tools', 'finance': 'Finance Tools', 'creator': 'Creator & SEO Tools'}
INTRO = {
 'dev': 'Format JSON, decode JWTs, test regular expressions, sort Tailwind classes and diff text. Every developer tool runs locally in your browser, so tokens and payloads are never uploaded.',
 'design': 'Extract palettes, check WCAG contrast, optimise SVGs into JSX, compress images and generate gradients, shadows and glassmorphism CSS without leaving the page.',
 'finance': 'Convert numbers to Arabic and English words (tafqeet), calculate VAT and margins, build invoices, work out loan instalments and count working days, all privately in your browser.',
 'creator': 'Clean text, count words, generate meta tags and JSON-LD, build UTM links with QR codes, create slugs and hashtags, and preview Markdown for faster publishing and better SEO.'}
SLUG = {'Tafqeet (Number to Words)': 'tafqeet-arabic-number-to-words'}
slug = lambda n: SLUG.get(n) or re.sub(r'[^a-z0-9]+', '-', n.lower()).strip('-')

# ---- read tool metadata straight from the app source -------------------------------------------
LOADER = """const vm=require('vm'),fs=require('fs');const s=fs.readFileSync(process.argv[2],'utf8');const x={};vm.createContext(x);
vm.runInContext(s.slice(0,s.indexOf('const BB='))+';var __R=ROLES_CONFIG.map(r=>({id:r.id,n:r.n,i:r.i,a:r.a,tools:r.tools.map(t=>({n:t.n,ti:t.ti,i:t.i,k:t.k,d:t.d,img:!!t.img,noin:!!t.noin}))}));',x);
process.stdout.write(JSON.stringify(x.__R))"""
# The loader goes through a temp file (not `node -e`) because Windows limits command lines to ~32k chars.
with tempfile.TemporaryDirectory() as _d:
    _js = os.path.join(_d, 'load.js'); open(_js, 'w', encoding='utf-8').write(LOADER)
    R = json.loads(subprocess.check_output(['node', _js, os.path.abspath('src/app.js')], encoding='utf-8'))
seen = set()
for ri, r in enumerate(R):
    r['hub'] = '/%s/' % HUB[r['id']]
    for ti, t in enumerate(r['tools']):
        t.update(r=ri, t=ti, h1=t.get('ti') or t['n'], path='/%s/' % slug(t['n']))
        assert t['path'] not in seen, t['path']; seen.add(t['path'])
ALL = [t for r in R for t in r['tools']]
# ---- hand-written copy (src/content.json): one unique paragraph + one tip per tool ---------------------
CONTENT = json.load(open('src/content.json', encoding='utf-8'))
_missing = [t['n'] for t in ALL if t['n'] not in CONTENT]
_extra = [n for n in CONTENT if n not in {t['n'] for t in ALL}]
assert not _missing and not _extra, f'src/content.json out of sync. missing: {_missing} unknown: {_extra}'
assert len({c['about'] for c in CONTENT.values()}) == len(ALL), 'duplicate about paragraphs'
for _n, _c in CONTENT.items():
    assert 150 <= len(_c['about']) <= 520 and 60 <= len(_c['tip']) <= 300, f'{_n}: about/tip length out of range'
TODAY = datetime.date.today().isoformat()

# ---- assets ----------------------------------------------------------------------------------------
try:
    subprocess.check_call([shutil.which('npx') or 'npx', '--no-install', 'tailwindcss', '-i', 'src/input.css', '-o', 'assets/style.css', '--minify'], stderr=subprocess.DEVNULL)
except (subprocess.CalledProcessError, FileNotFoundError):
    print('WARNING: Tailwind not installed (run npm install); keeping the existing assets/style.css')
shutil.copyfile('src/app.js', 'assets/app.js')
open('assets/routes.js', 'w', encoding='utf-8').write('const ROUTES=%s;\n' % json.dumps([[t['path'] for t in r['tools']] for r in R]))
V = {f: hashlib.md5(open('assets/' + f, 'rb').read()).hexdigest()[:8] for f in ('style.css', 'app.js', 'routes.js')}
open('favicon.svg', 'w', encoding='utf-8').write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="64" height="64" rx="16" fill="url(#g)"/><text x="32" y="41" font-family="monospace" font-weight="800" font-size="26" text-anchor="middle" fill="#04110c">&lt;/&gt;</text></svg>')
try:
    from PIL import Image, ImageDraw, ImageFont
    im = Image.new('RGB', (1200, 630), '#090d16'); d = ImageDraw.Draw(im)
    for i in range(630):
        d.line([(0, i), (1200, i)], fill=(9 + i // 40, 13 + i // 18, 22 + i // 14))
    f = lambda s: next((ImageFont.truetype(p, s) for p in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 'DejaVuSans-Bold.ttf') if os.path.exists(p) or p.startswith('Deja')), ImageFont.load_default())
    d.rounded_rectangle((90, 120, 230, 260), 32, fill='#10b981'); d.text((126, 160), '</>', font=f(52), fill='#04110c')
    d.text((90, 300), 'SpeedWork', font=f(110), fill='#ffffff')
    d.text((94, 440), '32 free, private online tools that run in your browser', font=f(34), fill='#94a3b8')
    d.text((94, 500), 'speedwork.aymanstack.com', font=f(30), fill='#22d3ee'); im.save('assets/og.png', optimize=True)
except Exception as e:
    print('og.png skipped:', e)

# ---- shared HTML pieces -----------------------------------------------------------------------------
def head(title, desc, path, ri, ld):
    u = BASE + path; a = R[ri]['a'] if ri is not None else '#10b981'; b = BB[ri or 0]
    j = json.dumps({'@context': 'https://schema.org', '@graph': ld}, ensure_ascii=False).replace('</', '<\\/')
    return f'''<!DOCTYPE html><html lang="en" style="--a:{a};--b:{b}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title><meta name="description" content="{E(desc)}"><link rel="canonical" href="{u}"><meta name="robots" content="index,follow,max-image-preview:large"><meta name="theme-color" content="#090d16">
<meta property="og:type" content="website"><meta property="og:site_name" content="SpeedWork"><meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}"><meta property="og:url" content="{u}"><meta property="og:image" content="{BASE}/assets/og.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{E(title)}"><meta name="twitter:description" content="{E(desc)}"><meta name="twitter:image" content="{BASE}/assets/og.png">
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/assets/style.css?v={V['style.css']}">
<script type="application/ld+json">{j}</script></head>'''

def crumbs(items):
    return {'@type': 'BreadcrumbList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'name': n, 'item': BASE + p} for i, (n, p) in enumerate(items)]}

def top(active=None):
    tabs = ''.join(f'<a href="{r["hub"]}" class="rb glass rounded-lg py-1.5 px-4 text-sm border whitespace-nowrap {"on" if i == active else ""}" style="border-color:{r["a"] if i == active else "transparent"}"{CUR if i == active else ""}>{r["i"]} {r["n"]}</a>' for i, r in enumerate(R))
    return f'''<a class="skip" href="#main">Skip to content</a>
<header class="sticky top-0 z-30 glass border-b border-slate-800/70"><div class="max-w-7xl mx-auto flex items-center gap-4 px-4 lg:px-6 py-2.5">
<a href="/" class="flex items-center gap-3 shrink-0" aria-label="SpeedWork home"><span class="w-10 h-10 rounded-xl grid place-items-center font-black text-slate-950 text-sm" style="background:linear-gradient(135deg,var(--a),var(--b))" aria-hidden="true">&lt;/&gt;</span><span class="font-extrabold text-lg">Speed<span class="hero-g">Work</span></span></a>
<nav aria-label="Categories" class="flex gap-2 overflow-x-auto ml-auto">{tabs}</nav></div></header>'''

def footer():
    cols = ''.join(f'<div><h2 class="font-bold text-sm mb-2"><a href="{r["hub"]}">{r["i"]} {LABEL[r["id"]]}</a></h2><ul class="space-y-1">' + ''.join(f'<li><a class="text-sm text-slate-400 hover:text-white" href="{t["path"]}">{E(t["h1"])}</a></li>' for t in r['tools']) + '</ul></div>' for r in R)
    return f'''<footer class="border-t border-slate-800/70 mt-16"><div class="max-w-7xl mx-auto px-4 lg:px-6 py-10"><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-8">{cols}</div>
<p class="text-sm text-slate-400 mt-10">© {datetime.date.today().year} <a href="/" class="font-semibold text-white">SpeedWork</a> · Free, private, keyboard-first tools. Inputs are processed in your browser and are never uploaded; your last 3 snippets per tool stay on this device only.</p></div></footer>'''

def card(t):
    s = f'{t["h1"]} {t["k"]} {R[t["r"]]["n"]}'.lower()
    return f'<a href="{t["path"]}" class="tcard" style="--c:{R[t["r"]]["a"]}" data-s="{E(s)}"><span class="text-2xl" aria-hidden="true">{t["i"]}</span><span class="font-bold text-white">{E(t["h1"])}</span><span class="text-sm text-slate-400 leading-5">{E(t["d"])}</span></a>'

def page(path, content, *args):
    out = os.path.join('.', path.strip('/'), 'index.html') if path != '/' else 'index.html'
    os.makedirs(os.path.dirname(out) or '.', exist_ok=True)
    open(out, 'w', encoding='utf-8').write(content)

# ---- home --------------------------------------------------------------------------------------------
HOME_D = '32 free online tools for developers, designers, finance and creators: JSON formatter, JWT decoder, regex tester, VAT calculator, tafqeet, palette extractor and more. Private, fast, no sign-up.'
secs = ''.join(f'<section class="mt-12" aria-labelledby="h-{r["id"]}"><div class="flex items-end justify-between mb-4"><h2 id="h-{r["id"]}" class="text-2xl font-extrabold">{r["i"]} {LABEL[r["id"]]}</h2><a href="{r["hub"]}" class="text-sm font-semibold" style="color:{r["a"]}">View all →</a></div><div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">{"".join(card(t) for t in r["tools"])}</div></section>' for r in R)
FAQ_H = [('Is SpeedWork free?', 'Yes. All 32 tools are free to use with no sign-up, no limits and no ads.'),
         ('Is my data uploaded anywhere?', 'No. Every tool runs in your browser with JavaScript, so your code, tokens, text and images are never sent to a server. Your last three snippets per tool are stored locally on your device and can be cleared at any time.'),
         ('What does zero-mouse mean?', 'You can work almost entirely from the keyboard: paste anywhere with Ctrl+V, copy the result with Ctrl+C, search every tool with Ctrl+K, switch tools with Alt+1–8 and categories with Shift+1–4.')]
faq = ''.join(f'<details><summary>{E(q)}</summary><p>{E(a)}</p></details>' for q, a in FAQ_H)
ld = [{'@type': 'WebSite', 'name': 'SpeedWork', 'url': BASE + '/', 'description': HOME_D},
      {'@type': 'ItemList', 'name': 'SpeedWork tools', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': BASE + t['path'], 'name': t['h1']} for i, t in enumerate(ALL)]},
      {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in FAQ_H]}]
page('/', head('SpeedWork – 32 Free, Private Online Tools for Developers & Creators', HOME_D, '/', None, ld) + f'''<body>{top()}<main id="main" class="max-w-7xl mx-auto px-4 lg:px-6">
<section class="text-center max-w-3xl mx-auto pt-12 pb-4"><p class="mono inline-block">32 free tools · no sign-up · runs in your browser</p>
<h1 class="text-4xl sm:text-5xl font-extrabold tracking-tight mt-5 leading-tight">Fast, private online tools for <span class="hero-g">developers, designers, finance &amp; creators</span></h1>
<p class="text-lg text-slate-300 mt-5">Paste, process, copy. Format JSON, decode JWTs, check contrast, calculate VAT, write tafqeet and more, without uploading a single byte.</p>
<input id="q" type="search" class="in mt-7 !text-base" placeholder="Search 32 tools: json, vat, svg, jwt, tafqeet…" aria-label="Search tools" autocomplete="off"></section>
{secs}
<section class="mt-16 max-w-3xl" aria-labelledby="h-faq"><h2 id="h-faq" class="text-2xl font-extrabold mb-4">Frequently asked questions</h2>{faq}</section></main>{footer()}
<script>var q=document.getElementById('q');q.addEventListener('input',function(){{var w=q.value.toLowerCase().split(/\\s+/).filter(Boolean);document.querySelectorAll('[data-s]').forEach(function(c){{c.hidden=!w.every(function(k){{return c.dataset.s.indexOf(k)>-1}})}})}})</script></body></html>''')

# ---- category hubs -----------------------------------------------------------------------------------
for ri, r in enumerate(R):
    t0 = f'{LABEL[r["id"]]}: 8 Free Online Tools | SpeedWork'
    d0 = f'{INTRO[r["id"]][:130].rsplit(" ", 1)[0]}. Free, private, no sign-up.'
    ld = [crumbs([('Home', '/'), (LABEL[r['id']], r['hub'])]),
          {'@type': 'CollectionPage', 'name': LABEL[r['id']], 'url': BASE + r['hub'], 'description': INTRO[r['id']]},
          {'@type': 'ItemList', 'itemListElement': [{'@type': 'ListItem', 'position': i + 1, 'url': BASE + t['path'], 'name': t['h1']} for i, t in enumerate(r['tools'])]}]
    page(r['hub'], head(t0, d0, r['hub'], ri, ld) + f'''<body>{top(ri)}<main id="main" class="max-w-7xl mx-auto px-4 lg:px-6 pt-8">
<nav aria-label="Breadcrumb" class="text-sm text-slate-400"><a href="/" class="hover:text-white">Home</a> › {LABEL[r["id"]]}</nav>
<h1 class="text-4xl font-extrabold tracking-tight mt-3">{r["i"]} <span class="hero-g">{LABEL[r["id"]]}</span></h1><p class="text-lg text-slate-300 mt-3 max-w-3xl">{INTRO[r["id"]]}</p>
<div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">{"".join(card(t) for t in r["tools"])}</div></main>{footer()}</body></html>''')

# ---- one page per tool ----------------------------------------------------------------------------------
for ri, r in enumerate(R):
    for ti, t in enumerate(r['tools']):
        h1 = t['h1']; lab = LABEL[r['id']]
        title = f'{h1} – Free Online Tool | SpeedWork'
        if len(title) > 60: title = f'{h1} | SpeedWork'
        desc = f'{t["d"]} Free, private and runs in your browser – no sign-up.'
        side = ''.join(f'<a href="{x["path"]}" class="tool {"on" if x is t else ""} rounded-xl px-3 py-2.5 flex items-center gap-3 text-slate-300 text-[15px]"{CUR if x is t else ""}><span class="w-6 text-center" aria-hidden="true">{x["i"]}</span><span class="flex-1 font-medium">{E(x["n"])}</span><kbd class="mono">Alt {j + 1}</kbd></a>' for j, x in enumerate(r['tools']))
        chips = ''.join(f'<a href="{x["path"]}" class="pill whitespace-nowrap {"on" if x is t else ""}" style="{"border-color:var(--a)" if x is t else ""}">{x["i"]} {E(x["n"])}</a>' for x in r['tools'])
        step1 = 'Drop, click or paste (Ctrl+V) an image onto the tool.' if t['img'] else 'Set the options with the controls; there is no text to paste for this tool.' if t['noin'] else 'Paste or type your input, or press Ctrl+V anywhere on the page.'
        faqs = [(f'Is the {h1} free to use?', f'Yes. The {h1} is completely free, needs no account and has no usage limits.'),
                (f'Is my data uploaded when I use the {h1}?', 'No. Everything is processed locally in your browser, so what you paste never leaves your device. The last 3 snippets are kept on this device only and you can clear them with one click.'),
                (f'How do I use the {h1}?', f'{step1} Results update instantly, then copy them with the Copy button or Ctrl+C.')]
        rel = [r['tools'][(ti + k) % 8] for k in (1, 2, 3, 4)]
        topics = ''.join(f'<li class="pill">{E(k)}</li>' for k in t['k'].split())
        ld = [{'@type': 'WebApplication', 'name': h1, 'url': BASE + t['path'], 'description': t['d'], 'applicationCategory': CAT[r['id']], 'operatingSystem': 'Any', 'browserRequirements': 'Requires JavaScript', 'isAccessibleForFree': True, 'offers': {'@type': 'Offer', 'price': '0', 'priceCurrency': 'USD'}, 'publisher': {'@type': 'Organization', 'name': 'SpeedWork', 'url': BASE}},
              crumbs([('Home', '/'), (lab, r['hub']), (h1, t['path'])]),
              {'@type': 'FAQPage', 'mainEntity': [{'@type': 'Question', 'name': q, 'acceptedAnswer': {'@type': 'Answer', 'text': a}} for q, a in faqs]}]
        qr = '<script defer src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>' if 'QR' in t['n'] else ''
        page(t['path'], head(title, desc, t['path'], ri, ld) + f'''<body data-r="{ri}" data-t="{ti}">{top(ri)}
<div class="max-w-7xl mx-auto flex gap-8 px-4 lg:px-6 py-6">
<aside class="hidden lg:flex w-64 shrink-0 flex-col gap-3 sticky top-20 self-start"><nav aria-label="{lab}" class="flex flex-col gap-1">{side}</nav>
<div class="card !p-3 text-xs text-slate-400 leading-4"><div class="font-bold text-sm mb-1" style="color:var(--a)">🔒 100% private</div>Inputs are processed in your browser and never uploaded. Your last 3 snippets per tool stay on this device only.</div>
<button id="kb" class="obtn justify-center text-sm !py-2.5" type="button">? Keyboard shortcuts</button></aside>
<main id="main" class="flex-1 min-w-0 flex flex-col gap-6">
<div><nav aria-label="Breadcrumb" class="text-sm text-slate-400"><a href="/" class="hover:text-white">Home</a> › <a href="{r["hub"]}" class="hover:text-white">{lab}</a> › {E(h1)}</nav>
<h1 class="text-3xl sm:text-4xl font-extrabold tracking-tight mt-3"><span aria-hidden="true">{t["i"]}</span> {E(h1)}</h1><p class="text-lg text-slate-300 mt-2 max-w-3xl">{E(t["d"])}</p></div>
<nav aria-label="Tools in this category" class="lg:hidden flex gap-2 overflow-x-auto pb-1">{chips}</nav>
<div id="ws"><noscript><p class="card">This tool needs JavaScript. It runs entirely in your browser and never uploads your data.</p></noscript></div>
<section class="card prose-sw" aria-labelledby="about"><h2 id="about" class="text-xl font-bold mb-2">About the {E(h1)}</h2>
<p>{E(CONTENT[t["n"]]["about"])}</p>
<p class="tip"><strong>Tip:</strong> {E(CONTENT[t["n"]]["tip"])}</p>
<p>{E(h1)} is free, needs no sign-up and runs entirely in your browser, so what you paste never leaves your device.</p>
<h3 class="font-bold mt-5 mb-1">How to use it</h3><ol><li>{step1}</li><li>Adjust the options. The result updates instantly.</li><li>Copy the output with the Copy button or Ctrl+C.</li></ol>
<h3 class="font-bold mt-5 mb-2">Topics</h3><ul class="flex flex-wrap gap-2">{topics}</ul></section>
<section aria-labelledby="faq"><h2 id="faq" class="text-xl font-bold mb-3">Frequently asked questions</h2>{"".join(f"<details><summary>{E(q)}</summary><p>{E(a)}</p></details>" for q, a in faqs)}</section>
<section aria-labelledby="rel"><h2 id="rel" class="text-xl font-bold mb-3">More {lab.lower()}</h2><div class="grid sm:grid-cols-2 gap-4">{"".join(card(x) for x in rel)}</div></section>
</main></div>{footer()}
<div id="toast" role="status" aria-live="polite" class="fixed top-4 right-4 z-50 px-4 py-2 rounded-xl text-sm font-medium text-slate-950 opacity-0 pointer-events-none transition-opacity" style="background:var(--a)"></div>
<div id="modal" role="dialog" aria-modal="true" aria-label="Dialog" class="fixed inset-0 z-40 hidden bg-black/60 backdrop-blur-sm items-start justify-center pt-24"><div id="mbox" class="glass rounded-2xl w-[560px] max-w-[92vw] p-4"></div></div>
<script defer src="/assets/routes.js?v={V['routes.js']}"></script>{qr}<script defer src="/assets/app.js?v={V['app.js']}"></script></body></html>''')

# ---- 404, sitemap, robots -------------------------------------------------------------------------------
open('404.html', 'w', encoding='utf-8').write(head('Page not found | SpeedWork', 'This page does not exist. Browse all SpeedWork tools.', '/404.html', None, [])
    .replace('index,follow', 'noindex') + f'<body>{top()}<main id="main" class="max-w-3xl mx-auto px-4 py-24 text-center"><h1 class="text-5xl font-extrabold hero-g">404</h1><p class="text-lg text-slate-300 mt-4">That page does not exist, but there are 32 tools waiting for you.</p><a href="/" class="gbtn mt-8">Browse all tools</a></main>{footer()}</body></html>')
urls = ['/'] + [r['hub'] for r in R] + [t['path'] for t in ALL]
open('sitemap.xml', 'w', encoding='utf-8').write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + ''.join(f'<url><loc>{BASE}{u}</loc><lastmod>{TODAY}</lastmod><priority>{"1.0" if u == "/" else "0.8"}</priority></url>\n' for u in urls) + '</urlset>\n')
open('robots.txt', 'w', encoding='utf-8').write(f'User-agent: *\nAllow: /\nSitemap: {BASE}/sitemap.xml\n')
long_d = [t['h1'] for t in ALL if len(f'{t["d"]} Free, private and runs in your browser – no sign-up.') > 160]
print(f'{len(ALL)} tool pages + {len(R)} hubs + home + 404; sitemap {len(urls)} URLs; meta descriptions >160 chars: {long_d}')