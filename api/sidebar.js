/**
 * Jarvis Sidebar — shared across every dashboard page.
 *
 * Include with: <script src="/sidebar.js"></script>
 *
 * On load this:
 *   1. Wraps whatever's already in <body> into a content column
 *   2. Injects the sidebar as a real flex sibling (reflow, not an overlay)
 *   3. Populates its project + section list from the same live
 *      /api/workspaces-data endpoint the Home screen uses — one source of
 *      truth, so a row added in Notion shows up here too with no code change
 *   4. Highlights whichever page is currently open
 *
 * index.html (the Home picker) intentionally does NOT include this script —
 * it IS the workspace switcher, so a sidebar next to it would be redundant.
 */
(function () {
  const CSS = `
    :root{
      --sbw: 220px;
    }
    body.jarvis-has-sidebar{
      display:flex; align-items:stretch; min-height:100vh; margin:0;
    }
    .jarvis-sidebar{
      width:var(--sbw); flex-shrink:0; background:#0d0e15; border-right:1px solid rgba(255,255,255,0.06);
      display:flex; flex-direction:column; position:sticky; top:0; height:100vh; overflow-y:auto;
      font-family:'Inter', sans-serif;
    }
    .jarvis-sidebar .sb-logo{ display:flex; align-items:center; gap:10px; padding:20px 18px 16px; }
    .jarvis-sidebar .sb-logo-mark{ width:34px; height:34px; border-radius:9px; background:rgba(201,169,97,0.14);
      color:#c9a961; display:flex; align-items:center; justify-content:center; font-size:16px; flex-shrink:0; }
    .jarvis-sidebar .sb-logo-text h1{ font-family:'Fraunces', serif; font-size:15px; font-weight:700; color:#f3f0e8; letter-spacing:0.3px; }
    .jarvis-sidebar .sb-logo-text p{ font-size:9.5px; color:#67645a; text-transform:uppercase; letter-spacing:0.6px; margin-top:1px; }
    .jarvis-sidebar .sb-section-label{ font-size:9.5px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase;
      color:#67645a; padding:14px 18px 6px; }
    .jarvis-sidebar nav{ flex:1; padding:0 10px; }
    .jarvis-sidebar .sb-item{
      display:flex; align-items:center; gap:10px; padding:8px 10px; border-radius:8px; margin-bottom:2px;
      color:#9a9683; font-size:12.5px; font-weight:500; cursor:pointer; text-decoration:none; opacity:1;
      transition:background 0.12s, color 0.12s;
    }
    .jarvis-sidebar .sb-item:hover{ background:rgba(255,255,255,0.04); color:#f3f0e8; }
    .jarvis-sidebar .sb-item.active{ background:rgba(201,169,97,0.14); color:#e0c584; font-weight:600; }
    .jarvis-sidebar .sb-item.coming-soon{ opacity:0.5; }
    .jarvis-sidebar .sb-item .sb-icon{ width:18px; text-align:center; flex-shrink:0; font-size:13px; }
    .jarvis-sidebar .sb-divider{ height:1px; background:rgba(255,255,255,0.06); margin:10px 14px; }
    .jarvis-sidebar .sb-footer{ padding:14px 18px; border-top:1px solid rgba(255,255,255,0.06); display:flex; align-items:center; gap:10px; }
    .jarvis-sidebar .sb-avatar{ width:30px; height:30px; border-radius:50%; background:rgba(201,169,97,0.14); color:#c9a961;
      display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:700; flex-shrink:0; }
    .jarvis-sidebar .sb-footer-text p:first-child{ font-size:12px; font-weight:600; color:#f3f0e8; }
    .jarvis-sidebar .sb-footer-text p:last-child{ font-size:10.5px; color:#67645a; }
    .jarvis-content-area{ flex:1; min-width:0; }
    @media (max-width:820px){
      :root{ --sbw:0px; }
      .jarvis-sidebar{ display:none; }
    }
  `;

  function iconFor(name) {
    // Falls back to the Notion-stored emoji already fetched per workspace —
    // this is only used for the two hardcoded, non-Notion nav items.
    return name === "Command Center" ? "🏛️" : "📁";
  }

  function buildSidebarHTML(workspaces) {
    const isBusiness = (w) => w.type === "Business";
    const isSettings = (w) => w.name === "Sistemas & Ajustes";
    const topGroup = workspaces.filter((w) => !isBusiness(w) && !isSettings(w)).sort((a, b) => a.order - b.order);
    const bizGroup = workspaces.filter(isBusiness).sort((a, b) => a.order - b.order);
    const settingsItem = workspaces.find(isSettings);

    const path = window.location.pathname;
    function isActive(route) {
      if (!route) return false;
      try {
        const routePath = new URL(route, window.location.origin).pathname;
        return routePath === path;
      } catch (e) {
        return false;
      }
    }

    function itemHTML(w) {
      const comingSoon = w.status === "Coming soon";
      const href = w.route || `/coming-soon.html?${new URLSearchParams({ name: w.name, icon: w.icon || "" })}`;
      return `<a class="sb-item ${isActive(w.route) ? "active" : ""} ${comingSoon ? "coming-soon" : ""}" href="${href}">
        <span class="sb-icon">${w.icon || "📁"}</span><span>${w.name}</span>
      </a>`;
    }

    return `
      <div class="sb-logo">
        <div class="sb-logo-mark">◈</div>
        <div class="sb-logo-text"><h1>JARVIS</h1><p>Command Center</p></div>
      </div>
      <div class="sb-section-label">Menú Principal</div>
      <nav>
        <a class="sb-item ${path === "/" || path === "/index.html" ? "active" : ""}" href="/">
          <span class="sb-icon">${iconFor("Command Center")}</span><span>Command Center</span>
        </a>
        ${topGroup.map(itemHTML).join("")}
        <div class="sb-divider"></div>
        ${bizGroup.map(itemHTML).join("")}
        ${settingsItem ? `<div class="sb-divider"></div>${itemHTML(settingsItem)}` : ""}
      </nav>
      <div class="sb-footer">
        <div class="sb-avatar">AM</div>
        <div class="sb-footer-text"><p>Aurelio M.</p><p>Administrador</p></div>
      </div>`;
  }

  function mount(html) {
    // Move everything already in <body> into a content wrapper, then
    // prepend the sidebar — a real reflow, not an overlay.
    const content = document.createElement("div");
    content.className = "jarvis-content-area";
    while (document.body.firstChild) content.appendChild(document.body.firstChild);

    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);

    const sidebar = document.createElement("div");
    sidebar.className = "jarvis-sidebar";
    sidebar.innerHTML = html;

    document.body.classList.add("jarvis-has-sidebar");
    document.body.appendChild(sidebar);
    document.body.appendChild(content);
  }

  // Minimal fallback list, used only if the live fetch fails — keeps
  // navigation usable, never presented as live data.
  const FALLBACK = [
    { name: "Tareas & Proyectos", icon: "✅", route: "/tareas-proyectos.html", type: "System", status: "Live", order: 2 },
    { name: "Mis Gustos & Conocimiento", icon: "💙", route: "/mis-gustos-aprendizajes.html", type: "Personal", status: "Live", order: 3 },
    { name: "Aristóteles", icon: "🦉", route: "/aristoteles.html", type: "Personal", status: "Live", order: 4 },
    { name: "Personal OS", icon: "🧠", route: "/personal-os.html", type: "Personal", status: "Live", order: 5 },
    { name: "One Night Guest", icon: "🏛️", route: "/project-command-center.html?project=onenightguest", type: "Business", status: "Live", order: 1 },
    { name: "RoutePup", icon: "🐾", route: "/project-command-center.html?project=RoutePup", type: "Business", status: "Coming soon", order: 2 },
    { name: "StatStrike", icon: "📊", route: "/project-command-center.html?project=StatStrike", type: "Business", status: "Coming soon", order: 3 },
    { name: "Nikita", icon: "🤖", route: "/project-command-center.html?project=Nikita", type: "Business", status: "Coming soon", order: 4 },
    { name: "Sistemas & Ajustes", icon: "⚙️", route: "/sistemas-ajustes.html", type: "System", status: "Live", order: 999 },
  ];

  async function init() {
    try {
      const res = await fetch("/api/workspaces-data");
      if (!res.ok) throw new Error("API error " + res.status);
      const data = await res.json();
      if (!data.workspaces || !data.workspaces.length) throw new Error("Empty list");
      mount(buildSidebarHTML(data.workspaces));
    } catch (err) {
      console.warn("Sidebar: live workspace list unavailable, using fallback:", err.message);
      mount(buildSidebarHTML(FALLBACK));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
