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
 * Included on every page, including index.html (the Home picker).
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
    .jarvis-sidebar .sb-item .sb-icon{ width:18px; text-align:center; flex-shrink:0; font-size:13px; display:inline-grid; place-items:center; }
    .jarvis-sidebar .sb-icon .ws-mono{ font:700 9px Inter,system-ui,sans-serif; letter-spacing:.02em; }
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

  // Workspace names, icons and routes come from Notion — escape everything
  // before it goes into innerHTML, and only allow http(s)/relative links.
  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function safeUrl(value) {
    if (!value) return "";
    try {
      const u = new URL(String(value || ""), window.location.origin);
      return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
    } catch (e) {
      return "";
    }
  }

  // Line icons from /ws-icons.js (loaded before the sidebar is built); the
  // Notion emoji is only the last resort if that file fails to load.
  function iconFor(name, emoji) {
    if (window.JarvisIcons) return window.JarvisIcons.markup(name, { size: "16", color: "currentColor", stroke: 1.7 });
    return esc(emoji || "◈");
  }
  function loadIcons() {
    if (window.JarvisIcons) return Promise.resolve();
    return new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "/ws-icons.js"; s.onload = resolve; s.onerror = resolve;
      document.head.appendChild(s);
    });
  }

  function buildSidebarHTML(workspaces, appLogoUrl) {
    // Decision Log is retained in Notion but removed from the user-facing Jarvis navigation.
    workspaces = workspaces.filter((w) => String(w.name || w.canonicalName || '').toLowerCase() !== 'decision log');
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
      const canonical = w.canonicalName || w.name;
      const sharedBusiness = ["One Night Guest", "RoutePup", "StatStrike", "Nikita"];
      const href = canonical === "One Night Guest"
          ? "/ong-command-center.html"
          : sharedBusiness.includes(canonical)
            ? `/project-command-center.html?project=${encodeURIComponent(canonical)}`
        : (w.route || `/coming-soon.html?${new URLSearchParams({ name: w.name, icon: w.icon || "" })}`);
      const icon = String(w.icon || "📁");
      const iconMarkup = icon.startsWith("http") ? `<img src="${esc(safeUrl(icon))}" alt="" style="width:16px;height:16px;object-fit:contain;border-radius:4px">` : iconFor(canonical, icon);
      return `<a class="sb-item ${isActive(href) ? "active" : ""} ${comingSoon ? "coming-soon" : ""}" href="${esc(safeUrl(href) || "#")}">
        <span class="sb-icon">${iconMarkup}</span><span>${esc(w.displayName || w.name)}</span>
      </a>`;
    }

    return `
      <div class="sb-logo">
        <div class="sb-logo-mark">${safeUrl(appLogoUrl) ? `<img src="${esc(safeUrl(appLogoUrl))}" alt="Jarvis" style="width:100%;height:100%;object-fit:contain;border-radius:8px">` : "◈"}</div>
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
    { name: "One Night Guest", icon: "🏛️", route: "/ong-command-center.html", type: "Business", status: "Live", order: 1 },
    { name: "RoutePup", icon: "🐾", route: "/project-command-center.html?project=RoutePup", type: "Business", status: "Live", order: 2 },
    { name: "StatStrike", icon: "📊", route: "/project-command-center.html?project=StatStrike", type: "Business", status: "Live", order: 3 },
    { name: "Nikita", icon: "🤖", route: "/project-command-center.html?project=Nikita", type: "Business", status: "Live", order: 4 },
    { name: "Sistemas & Ajustes", icon: "⚙️", route: "/sistemas-ajustes.html", type: "System", status: "Live", order: 999 },
  ];

  async function init() {
    await loadIcons();
    try {
      const res = await fetch("/api/workspaces-data");
      if (!res.ok) throw new Error("API error " + res.status);
      const data = await res.json();
      if (!data.workspaces || !data.workspaces.length) throw new Error("Empty list");
      mount(buildSidebarHTML(data.workspaces, data.appLogoUrl));
    } catch (err) {
      console.warn("Sidebar: live workspace list unavailable, using fallback:", err.message);
      mount(buildSidebarHTML(FALLBACK, null));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
