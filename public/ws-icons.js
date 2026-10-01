/*
 * Workspace line icons, shared by Home and the sidebar (the mockup asks for
 * real icons instead of emoji placeholders). JarvisIcons.markup(name, opts)
 * returns an inline SVG for a known workspace, or its initials otherwise.
 * An uploaded logo (an http URL in Notion's icon) always takes precedence —
 * the callers check that first.
 */
(function () {
  const PATHS = Object.assign({'RoutePup':'<circle cx="7" cy="9" r="1.9"/><circle cx="11" cy="6" r="1.9"/><circle cx="15.5" cy="6.3" r="1.9"/><circle cx="18.6" cy="10" r="1.9"/><path d="M12.5 11.2c-2.8 0-5.6 3.4-5.6 5.6 0 1.6 1.3 2.4 2.7 2.1 1.1-.2 1.9-.6 2.9-.6s1.8.4 2.9.6c1.4.3 2.7-.5 2.7-2.1 0-2.2-2.8-5.6-5.6-5.6z"/>','Tareas & Proyectos':'<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8 12.3 2.7 2.7L16.2 9"/>','Mis Gustos & Conocimiento':'<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/><path d="M9.5 10.5h5M12 8v5"/>','StatStrike':'<path d="M4 20h16"/><rect x="5.5" y="12" width="3" height="6" rx=".6"/><rect x="10.5" y="8" width="3" height="10" rx=".6"/><rect x="15.5" y="4.5" width="3" height="13.5" rx=".6"/>','Nikita':'<rect x="5" y="8" width="14" height="10" rx="3"/><path d="M12 8V5M10.5 4.5h3"/><circle cx="9.5" cy="13" r="1.2"/><circle cx="14.5" cy="13" r="1.2"/><path d="M3 12v3M21 12v3"/>','Aristóteles':'<path d="M3.5 9 12 4.5 20.5 9z"/><path d="M5 20h14M4 22h16M6.5 10v8M10 10v8M14 10v8M17.5 10v8"/>','Personal OS':'<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1.2"/>','Decision Log':'<path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z"/><path d="M14 3.5V8h4M9.5 12.5l1.8 1.8 3.4-3.6M9.5 17h5"/>','Meetings':'<circle cx="9" cy="8.5" r="2.6"/><circle cx="16.5" cy="9.5" r="2.1"/><path d="M4 19c.4-3 2.5-5 5-5s4.6 2 5 5M14.2 14.4c.7-.3 1.5-.5 2.3-.5 2 0 3.5 1.6 3.8 4.6"/>','Calendario':'<rect x="4" y="5.5" width="16" height="14.5" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4M8 13.5h2M14 13.5h2M8 16.5h2"/>','Sistemas & Ajustes':'<circle cx="12" cy="12" r="3"/><path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6"/>'}, {
    "Command Center": '<path d="M4 10.5 12 4l8 6.5"/><path d="M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
    "One Night Guest": '<path d="M12 3.5 14.4 9l5.6.5-4.3 3.7 1.4 5.6L12 15.9l-5.1 2.9 1.4-5.6L4 9.5 9.6 9z"/>',
  });
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function initials(name) {
    return String(name || "").split(/[\s&]+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 3).toUpperCase() || "◈";
  }
  // opts: { size: CSS size, color: CSS color, stroke, monogram: false to skip initials }
  function markup(name, opts = {}) {
    const d = PATHS[name];
    const size = opts.size || "54%", color = opts.color || "currentColor";
    if (d) return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="${color}" stroke-width="${opts.stroke || 1.5}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    return `<span class="ws-mono">${esc(initials(name))}</span>`;
  }
  window.JarvisIcons = { markup, has: (name) => !!PATHS[name], initials };
})();
