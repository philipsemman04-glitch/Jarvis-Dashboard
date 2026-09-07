/**
 * Jarvis Toast — lightweight write-confirmation feedback, shared across
 * every dashboard. Include with: <script src="/toast.js"></script>
 *
 * Usage:
 *   const id = jarvisToast.loading("Guardando…");
 *   ...await the write...
 *   jarvisToast.success(id, "Guardado");     // or
 *   jarvisToast.error(id, "No se pudo guardar: " + e.message);
 *
 * This exists because several actions (area create/rename/archive, task
 * status changes, comments, habit toggles) previously just fired a fetch()
 * and waited with zero on-screen feedback — Aurelio's exact "I end up
 * wondering whether Jarvis, Notion, or both contain the correct state"
 * complaint. Every write across the app should visibly move through
 * loading → confirmed (or a clear error) before the person moves on.
 */
(function () {
  const CSS = `
    #jarvis-toast-stack{ position:fixed; bottom:20px; right:20px; z-index:999; display:flex; flex-direction:column; gap:8px; }
    .jarvis-toast{
      display:flex; align-items:center; gap:9px; background:#171a24; border:1px solid rgba(255,255,255,0.09);
      color:#f3f0e8; font-family:'Inter',sans-serif; font-size:12.5px; padding:10px 14px; border-radius:10px;
      box-shadow:0 8px 24px rgba(0,0,0,0.4); min-width:180px; max-width:340px; opacity:0; transform:translateY(6px);
      transition:opacity 0.15s, transform 0.15s;
    }
    .jarvis-toast.show{ opacity:1; transform:translateY(0); }
    .jarvis-toast .spin{ width:13px; height:13px; border-radius:50%; border:2px solid rgba(255,255,255,0.2);
      border-top-color:#c9a961; animation:jarvis-spin 0.7s linear infinite; flex-shrink:0; }
    .jarvis-toast.success .dot{ color:#7cc99a; flex-shrink:0; }
    .jarvis-toast.error .dot{ color:#e0636b; flex-shrink:0; }
    @keyframes jarvis-spin{ to{ transform:rotate(360deg); } }
  `;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const stack = document.createElement("div");
  stack.id = "jarvis-toast-stack";
  document.body.appendChild(stack);

  let counter = 0;

  function loading(message) {
    const id = "toast-" + (counter++);
    const el = document.createElement("div");
    el.className = "jarvis-toast";
    el.id = id;
    el.innerHTML = `<span class="spin"></span><span class="msg">${message}</span>`;
    stack.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    return id;
  }

  function update(id, className, icon, message, autoDismissMs) {
    const el = document.getElementById(id);
    if (!el) return;
    el.className = "jarvis-toast show " + className;
    el.innerHTML = `<span class="dot">${icon}</span><span class="msg">${message}</span>`;
    if (autoDismissMs) {
      setTimeout(() => {
        el.classList.remove("show");
        setTimeout(() => el.remove(), 200);
      }, autoDismissMs);
    }
  }

  function success(id, message) { update(id, "success", "✓", message, 2200); }
  function error(id, message) { update(id, "error", "✕", message, 4500); }

  window.jarvisToast = { loading, success, error };
})();
