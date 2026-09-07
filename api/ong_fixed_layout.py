from pathlib import Path

p = Path('/home/ubuntu/work/jarvis-repo/public/ong-command-center.html')
s = p.read_text()

old = """  .main{min-width:0;max-width:1560px;margin:0 auto;padding:18px 22px 60px}
"""
new = """  :root{--ong-canvas-width:1560px;--ong-side-width:320px;--ong-stat-height:126px;--ong-hero-height:170px;--ong-board-col-width:260px;--ong-integrations-height:auto}
  html{min-width:var(--ong-canvas-width);overflow-x:auto;scrollbar-gutter:stable}
  body{min-width:var(--ong-canvas-width);overflow-x:auto}
  .main{width:var(--ong-canvas-width);min-width:var(--ong-canvas-width);max-width:none;margin:0 auto;padding:18px 22px 60px}
  .layout-scroll{width:100%;overflow-x:auto;overflow-y:visible;padding-bottom:8px;scrollbar-gutter:stable}
"""
assert old in s
s = s.replace(old, new, 1)

old = """  .hero{position:relative;border-radius:var(--radius);overflow:hidden;border:1px solid rgba(214,173,99,.22);margin-bottom:16px;min-height:170px;display:flex;align-items:center;background:linear-gradient(120deg,rgba(5,7,12,.82),rgba(5,7,12,.24)),url('/assets/covers/ong-cover-v2.jpg') center/cover}
"""
new = """  .hero{position:relative;border-radius:var(--radius);overflow:hidden;border:1px solid rgba(214,173,99,.22);margin-bottom:16px;height:var(--ong-hero-height);min-height:var(--ong-hero-height);display:flex;align-items:center;background:linear-gradient(120deg,rgba(5,7,12,.82),rgba(5,7,12,.24)),url('/assets/covers/ong-cover-v2.jpg') center/cover}
"""
assert old in s
s = s.replace(old, new, 1)

old = """  .stat-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px}
  .stat-card{background:linear-gradient(180deg,rgba(13,18,28,.96),rgba(9,13,21,.96));border:1px solid var(--line);border-radius:14px;padding:16px;position:relative;overflow:hidden}
"""
new = """  .stat-row{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:16px;height:var(--ong-stat-height)}
  .stat-card{background:linear-gradient(180deg,rgba(13,18,28,.96),rgba(9,13,21,.96));border:1px solid var(--line);border-radius:14px;padding:16px;position:relative;overflow:hidden;min-height:var(--ong-stat-height)}
"""
assert old in s
s = s.replace(old, new, 1)

old = """  .layout{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:14px;align-items:start}
"""
new = """  .layout{display:grid;grid-template-columns:minmax(0,1fr) var(--ong-side-width);gap:14px;align-items:start;min-width:0}
"""
assert old in s
s = s.replace(old, new, 1)

old = """  .board-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(215px,1fr));gap:12px}
  .board-col{background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column}
"""
new = """  .board-scroll{width:100%;overflow-x:auto;overflow-y:visible;padding-bottom:10px;scrollbar-gutter:stable}
  .board-cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(var(--ong-board-col-width),1fr));gap:12px;min-width:max-content}
  .board-col{width:var(--ong-board-col-width);min-width:var(--ong-board-col-width);background:rgba(255,255,255,.02);border:1px solid var(--line);border-radius:14px;padding:12px;display:flex;flex-direction:column}
"""
assert old in s
s = s.replace(old, new, 1)

old = """  .integ-row-wrap{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
"""
new = """  .integ-row-wrap{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;min-width:900px}
  .layout-controls{display:none;background:linear-gradient(180deg,rgba(16,22,35,.98),rgba(9,13,21,.98));border:1px solid rgba(214,173,99,.28);border-radius:14px;padding:14px;margin-bottom:14px}
  .layout-controls.open{display:block}
  .layout-controls-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
  .layout-controls-title{font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--gold-2)}
  .layout-controls-grid{display:grid;grid-template-columns:repeat(5,minmax(150px,1fr));gap:12px}
  .layout-control{display:flex;flex-direction:column;gap:6px}
  .layout-control label{font-size:10px;color:var(--muted);font-weight:700}
  .layout-control output{color:var(--gold-2);font-size:10px;font-weight:800}
  .layout-control input[type=range]{width:100%;accent-color:var(--gold)}
  .layout-reset{background:transparent;border:1px solid var(--line-strong);color:var(--muted);border-radius:8px;padding:6px 9px;font-size:10px;font-weight:700}
"""
assert old in s
s = s.replace(old, new, 1)

old = """  @media (max-width:1180px){.layout{grid-template-columns:1fr}.stat-row{grid-template-columns:repeat(2,1fr)}.integ-row-wrap{grid-template-columns:repeat(2,1fr)}}
  @media (max-width:760px){.main{padding:14px 12px}.stat-row{grid-template-columns:1fr 1fr}.hero-title{font-size:22px}.board-cols{grid-template-columns:1fr}}
"""
new = """  @media (max-width:1180px){.layout-controls-grid{grid-template-columns:repeat(3,minmax(150px,1fr))}}
  @media (max-width:760px){.layout-controls-grid{grid-template-columns:repeat(2,minmax(150px,1fr))}}
"""
assert old in s
s = s.replace(old, new, 1)

old = """    <div></div>
    <div class=\"head-actions\">"""
new = """    <div></div>
    <div class=\"head-actions\">
      <button class=\"top-pill\" id=\"layout-controls-toggle\" type=\"button\">⚙ Diseño</button>"""
assert old in s
s = s.replace(old, new, 1)

old = """  </div>

  <div class=\"hero\">"""
new = """  </div>

  <div class=\"layout-controls\" id=\"layout-controls\" aria-hidden=\"true\">
    <div class=\"layout-controls-head\">
      <div><div class=\"layout-controls-title\">Ajustar diseño</div><div class=\"panel-sub\">El lienzo permanece bloqueado; los cambios se guardan en este navegador.</div></div>
      <button class=\"layout-reset\" id=\"layout-reset\" type=\"button\">Restablecer</button>
    </div>
    <div class=\"layout-controls-grid\">
      <div class=\"layout-control\"><label for=\"layout-width\">Ancho del lienzo <output id=\"layout-width-value\"></output></label><input id=\"layout-width\" type=\"range\" min=\"1280\" max=\"2200\" step=\"10\" value=\"1560\"></div>
      <div class=\"layout-control\"><label for=\"layout-sidebar\">Ancho lateral <output id=\"layout-sidebar-value\"></output></label><input id=\"layout-sidebar\" type=\"range\" min=\"260\" max=\"460\" step=\"10\" value=\"320\"></div>
      <div class=\"layout-control\"><label for=\"layout-hero\">Alto del banner <output id=\"layout-hero-value\"></output></label><input id=\"layout-hero\" type=\"range\" min=\"120\" max=\"300\" step=\"10\" value=\"170\"></div>
      <div class=\"layout-control\"><label for=\"layout-stats\">Alto de indicadores <output id=\"layout-stats-value\"></output></label><input id=\"layout-stats\" type=\"range\" min=\"100\" max=\"220\" step=\"10\" value=\"126\"></div>
      <div class=\"layout-control\"><label for=\"layout-board\">Ancho de columnas <output id=\"layout-board-value\"></output></label><input id=\"layout-board\" type=\"range\" min=\"220\" max=\"420\" step=\"10\" value=\"260\"></div>
    </div>
  </div>

  <div class=\"hero\">"""
assert old in s
s = s.replace(old, new, 1)

old = """      <div class=\"board-cols\" id=\"board-cols\"></div>"""
new = """      <div class=\"board-scroll\"><div class=\"board-cols\" id=\"board-cols\"></div></div>"""
assert old in s
s = s.replace(old, new, 1)

anchor = """let filters = { area: \"all\", status: \"all\", priority: \"all\", priorityLevel: \"all\", person: \"all\" };\n"""
insert = """let filters = { area: \"all\", status: \"all\", priority: \"all\", priorityLevel: \"all\", person: \"all\" };\n\nconst LAYOUT_DEFAULTS = { width:1560, sidebar:320, hero:170, stats:126, board:260 };\nconst LAYOUT_KEYS = { width:\"--ong-canvas-width\", sidebar:\"--ong-side-width\", hero:\"--ong-hero-height\", stats:\"--ong-stat-height\", board:\"--ong-board-col-width\" };\nfunction applyLayoutSettings(settings){\n  const root = document.documentElement;\n  Object.entries(LAYOUT_KEYS).forEach(([key, cssVar]) => {\n    const value = Number(settings[key] || LAYOUT_DEFAULTS[key]);\n    root.style.setProperty(cssVar, value + \"px\");\n    const input = document.getElementById(\"layout-\" + key);\n    const output = document.getElementById(\"layout-\" + key + \"-value\");\n    if(input) input.value = value;\n    if(output) output.textContent = value + \"px\";\n  });\n  localStorage.setItem(\"jarvis:ong-layout\", JSON.stringify(settings));\n}\nfunction initLayoutControls(){\n  let saved = {};\n  try { saved = JSON.parse(localStorage.getItem(\"jarvis:ong-layout\") || \"{}\") || {}; } catch(e) {}\n  const settings = { ...LAYOUT_DEFAULTS, ...saved };\n  applyLayoutSettings(settings);\n  Object.keys(LAYOUT_KEYS).forEach(key => {\n    document.getElementById(\"layout-\" + key)?.addEventListener(\"input\", e => {\n      const next = {};\n      Object.keys(LAYOUT_KEYS).forEach(k => { next[k] = Number(document.getElementById(\"layout-\" + k).value); });\n      applyLayoutSettings(next);\n    });\n  });\n  document.getElementById(\"layout-reset\")?.addEventListener(\"click\", () => applyLayoutSettings({ ...LAYOUT_DEFAULTS }));\n  document.getElementById(\"layout-controls-toggle\")?.addEventListener(\"click\", () => {\n    const panel = document.getElementById(\"layout-controls\");\n    const open = panel.classList.toggle(\"open\");\n    panel.setAttribute(\"aria-hidden\", String(!open));\n  });\n}\n"""
assert anchor in s
s = s.replace(anchor, insert, 1)

old = """async function loadData(){"""
new = """initLayoutControls();\n\nasync function loadData(){"""
assert old in s
s = s.replace(old, new, 1)

p.write_text(s)
print('Updated', p)
