"""Generate original, script-free SVG assets. Standard library only."""
from pathlib import Path
import math
import html

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / 'assets'
BG, PANEL, TEXT, MUTED, BLUE = '#0b1220', '#162235', '#e2e8f0', '#94a3b8', '#60a5fa'

def svg(name, body, width=240, height=180, category='instruments'):
    path = ASSETS / category / (name + '.svg')
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="{html.escape(name)}"><title>{html.escape(name)}</title>{body}</svg>\n', encoding='utf-8')
    return body

def text(x,y,s,size=14,color=TEXT,anchor='middle'):
    return f'<text x="{x}" y="{y}" fill="{color}" font-family="sans-serif" font-size="{size}" text-anchor="{anchor}">{html.escape(str(s))}</text>'

def rect(x,y,w,h,fill=PANEL,rx=10):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'

def line(x1,y1,x2,y2,color=BLUE,width=3):
    return f'<path d="M{x1} {y1}L{x2} {y2}" fill="none" stroke="{color}" stroke-width="{width}" stroke-linecap="round"/>'

def arc(cx,cy,r,a,b,color,width=10):
    p=lambda angle:(cx+r*math.cos(math.radians(angle)),cy+r*math.sin(math.radians(angle)))
    x,y=p(a); xx,yy=p(b)
    return f'<path d="M{x:.2f} {y:.2f}A{r} {r} 0 {int(abs(b-a)>180)} 1 {xx:.2f} {yy:.2f}" fill="none" stroke="{color}" stroke-width="{width}"/>'

icons = {
 'connect':'<path d="M8 3v5m8-5v5M6 8h12v4a6 6 0 0 1-12 0V8zm6 10v3"/>',
 'disconnect':'<path d="M5 3l14 18M8 3v5m8-5v5M6 8h12v4M6 12a6 6 0 0 0 10 4m-4 2v3"/>',
 'play':'<path d="M7 4l13 8-13 8z"/>', 'stop':'<rect x="5" y="5" width="14" height="14" rx="2"/>',
 'save':'<path d="M4 3h13l3 3v15H4zM8 3v6h8V3M8 21v-7h8v7"/>',
 'open':'<path d="M3 7h7l2 3h9l-3 10H3zM3 7V4h7l2 3h7v3"/>',
 'undo':'<path d="M9 4L3 10l6 6M3 10h10a7 7 0 0 1 7 7v3"/>',
 'redo':'<path d="M15 4l6 6-6 6m6-6h-10a7 7 0 0 0-7 7v3"/>',
 'settings':'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
 'search':'<circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/>',
 'lock':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
 'unlock':'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8-2m-4 10v2"/>',
 'add':'<path d="M12 4v16M4 12h16"/>',
 'chart':'<path d="M4 3v17h17M6 15l4-6 4 3 6-7"/>',
 'scope':'<rect x="2" y="3" width="20" height="18" rx="2"/><path d="M4 12h3l2-6 4 12 2-6h5"/>',
 'memory':'<rect x="6" y="6" width="12" height="12" rx="1"/><path d="M9 2v4m6-4v4M9 18v4m6-4v4M2 9h4m-4 6h4m12-6h4m-4 6h4"/>',
 'log':'<path d="M5 3h14v18H5zM8 7h8M8 11h8M8 15h5"/>',
 'terminal':'<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M6 8l4 4-4 4m7 0h5"/>',
 'export':'<path d="M12 3v12m-5-7 5-5 5 5M4 14v7h16v-7"/>',
 'align':'<path d="M4 3v18M7 6h12v4H7zm0 8h8v4H7z"/>',
 'grid':'<path d="M3 3h18v18H3zm6 0v18m6-18v18M3 9h18M3 15h18"/>',
}
for name,body in icons.items():
    svg(name, f'<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">{body}</g>',24,24,'icons')

panel=rect(0,0,240,180)
radial=panel+text(120,25,'MOTOR SPEED',12,MUTED)+arc(120,120,72,150,390,'#334155')
for a,b,c in [(150,300,'#34d399'),(300,350,'#fbbf24'),(350,390,'#f87171')]:radial+=arc(120,120,72,a,b,c,6)
for i in range(6):
    a=math.radians(150+i*48)
    radial+=line(120+math.cos(a)*58,120+math.sin(a)*58,120+math.cos(a)*65,120+math.sin(a)*65,MUTED,2)
a=math.radians(150+240*.62)
radial+=line(120,120,120+math.cos(a)*54,120+math.sin(a)*54,BLUE,4)+f'<circle cx="120" cy="120" r="6" fill="{TEXT}"/>'+text(120,157,'1,860 rpm',20)
svg('radial-gauge',radial)
linear=panel+text(120,28,'CURRENT',12,MUTED)+rect(22,62,196,28,'#334155',4)+rect(22,62,122,28,BLUE,4)+text(120,132,'6.2 A',26)+text(22,110,'0',12,MUTED,'start')+text(218,110,'10',12,MUTED,'end')
svg('linear-gauge',linear)
thermo=panel+text(138,30,'TEMPERATURE',12,MUTED)+rect(45,34,24,101,'#334155',12)+rect(51,75,12,69,'#fb923c',6)+'<circle cx="57" cy="140" r="18" fill="#fb923c"/>'+text(147,103,'42.5 °C',25)
svg('thermometer',thermo)
tank=panel+text(120,26,'RESERVOIR',12,MUTED)+rect(68,43,104,107,'#334155',8)+rect(73,94,94,51,'#22d3ee',4)+text(120,174,'48 %',16)
svg('tank',tank)
compass=panel+f'<circle cx="120" cy="99" r="60" fill="{BG}" stroke="#334155" stroke-width="2"/>'+text(120,53,'N',12)+text(170,104,'E',12)+text(120,153,'S',12)+text(70,104,'W',12)+'<path d="M120 60l-9 44 9-5 9 5z" fill="#60a5fa" transform="rotate(35 120 99)"/>'+text(120,177,'35°',16)
svg('compass',compass)
numeric=panel+text(120,34,'BUS VOLTAGE',12,MUTED)+text(120,106,'24.08',44)+text(120,144,'V DC · LIVE',14,'#34d399')
svg('numeric-display',numeric)
led=panel+'<circle cx="120" cy="75" r="28" fill="#14532d"/><circle cx="120" cy="75" r="19" fill="#34d399"/>'+text(120,133,'ENABLED',20)+text(120,157,'State: On',13,MUTED)
svg('led',led)
slider=panel+text(120,32,'SPEED SETPOINT',12,MUTED)+line(28,90,212,90,'#334155',8)+line(28,90,142,90,BLUE,8)+f'<circle cx="142" cy="90" r="12" fill="{TEXT}"/>'+text(120,147,'1,860 rpm',20)
svg('slider',slider)
switch=panel+text(120,34,'MOTOR ENABLE',12,MUTED)+rect(74,65,92,44,'#2563eb',22)+'<circle cx="142" cy="87" r="17" fill="#e2e8f0"/>'+text(120,147,'On',22)
svg('switch',switch)
button=panel+rect(32,57,176,66,'#2563eb',8)+text(120,98,'RESET COUNTER',16)+text(120,154,'Press to apply',12,MUTED)
svg('push-button',button)
chart=panel+text(120,25,'SPEED HISTORY',12,MUTED)
for y in [50,80,110,140]:chart+=line(25,y,220,y,'#334155',1)
points=' '.join(f'{25+i*3},{100-32*math.sin(i*.15)}' for i in range(65))
chart+=f'<polyline points="{points}" fill="none" stroke="{BLUE}" stroke-width="2"/>'+text(120,169,'Acquisition time (s)',12,MUTED)
svg('line-chart',chart)

motor='<circle cx="120" cy="85" r="52" fill="#162235" stroke="#60a5fa" stroke-width="4"/>'+text(120,99,'M',40)+line(173,85,222,85)+line(85,138,155,138)+text(120,174,'Motor',16)
svg('motor',motor,category='industrial')
pump='<circle cx="110" cy="85" r="48" fill="#162235" stroke="#60a5fa" stroke-width="4"/><path d="M83 62l63 23-63 23z" fill="#60a5fa"/>'+line(10,85,62,85)+line(158,85,230,85)+text(120,171,'Pump',16)
svg('pump',pump,category='industrial')
valve='<path d="M55 55l65 60 65-60v60l-65-60-65 60z" fill="#162235" stroke="#60a5fa" stroke-width="4"/>'+line(10,85,55,85)+line(185,85,230,85)+line(120,55,120,24)+line(95,24,145,24)+text(120,171,'Valve',16)
svg('valve',valve,category='industrial')

# Required concept direction: light freeform instrument designer.
from designer_concept import build as build_designer_concept
build_designer_concept(svg, rect, text, line, arc)
paths=sorted(ASSETS.glob('*/*.svg'))
cards=''.join(f'<article><img src="{p.relative_to(ASSETS).as_posix()}" alt="{p.stem}"><p>{p.stem}</p></article>' for p in paths)
(ASSETS/'preview.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Open Live Watch original vectors</title><style>body{background:#0b1220;color:#e2e8f0;font:16px sans-serif;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}article{background:#162235;border:1px solid #334155;border-radius:12px;padding:16px;text-align:center}img{width:100%;height:180px;object-fit:contain}article:has(img[src*="icons"]){background:#e2e8f0;color:#0b1220}article:has(img[src*="icons"]) img{height:48px}article:has(img[src*="concepts"]){grid-column:1/-1}article:has(img[src*="concepts"]) img{height:auto}</style><h1>Original vector library</h1><p>MIT licensed. Static design starters; instrument behavior remains to implement.</p><main>'+cards+'</main></html>',encoding='utf-8')
print(f'Generated {len(paths)} original SVG assets and gallery.')
