/*
 * Penny AI only works once an AI provider key is set on the server. Until
 * then every element marked data-penny is hidden, so no page shows a Penny
 * button that can't answer. Pages can also read window.jarvisPennyReady.
 */
(function () {
  const style = document.createElement("style");
  style.textContent = "html:not(.penny-on) [data-penny]{display:none!important}";
  document.head.appendChild(style);
  window.jarvisPennyReady = fetch("/api/penny-ai", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { configured: false }))
    .then((d) => { if (d.configured) document.documentElement.classList.add("penny-on"); return !!d.configured; })
    .catch(() => false);
})();
