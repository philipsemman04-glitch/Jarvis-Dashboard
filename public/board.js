/*
 * Board navigation shared by the task boards (One Night Guest, RoutePup,
 * StatStrike, Nikita). JarvisBoard.attach(scroller, footer) adds:
 *  - ‹ › buttons that scroll one column at a time,
 *  - a gold track showing where you are on a wide board (click to jump),
 *  - Shift + mouse wheel / trackpad scrolling sideways.
 * Columns keep their own vertical scroll (CSS: .jb-col-body), so a column
 * with 200 tasks never makes the page itself 200 cards long.
 */
(function () {
  const style = document.createElement("style");
  style.textContent = `
.jb-foot{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:11px;color:#9fb1c3}
.jb-foot button{width:30px;height:30px;border-radius:8px;border:1px solid #8fbfe755;background:#0c2033;color:#f5f6f4;font-size:16px;font-weight:800;cursor:pointer;flex-shrink:0}
.jb-foot button:hover:not(:disabled){border-color:#e8c45d;color:#e8c45d}
.jb-foot button:disabled{opacity:.35;cursor:default}
.jb-track{position:relative;flex:1;height:8px;border-radius:6px;background:#102b40;cursor:pointer;min-width:60px}
.jb-thumb{position:absolute;top:0;bottom:0;border-radius:6px;background:linear-gradient(90deg,#f3d98f,#d4a83f);min-width:24px}
.jb-count{white-space:nowrap}
.jb-scroller{display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;scroll-behavior:smooth;padding-bottom:4px;scrollbar-width:thin;scrollbar-color:#d8b64b #102b40;overscroll-behavior-x:contain}
.jb-scroller::-webkit-scrollbar{height:10px}.jb-scroller::-webkit-scrollbar-track{background:#102b40;border-radius:8px}.jb-scroller::-webkit-scrollbar-thumb{background:#d8b64b;border-radius:8px;border:2px solid #102b40}
.jb-col{flex:0 0 272px;display:flex;flex-direction:column;max-height:min(68vh,720px);min-height:260px}
.jb-scroller.fit .jb-col{flex:1 1 240px;min-width:240px}
.jb-col-body{flex:1;overflow-y:auto;overscroll-behavior:contain;padding-right:2px;scrollbar-width:thin;scrollbar-color:#3d6584 transparent}
.jb-col-body::-webkit-scrollbar{width:6px}.jb-col-body::-webkit-scrollbar-thumb{background:#3d6584;border-radius:6px}
@media(max-width:760px){.jb-col{flex-basis:84vw;max-height:70vh}}`;
  document.head.appendChild(style);

  function attach(scroller, footer, opts = {}) {
    scroller.classList.add("jb-scroller");
    footer.classList.add("jb-foot");
    footer.innerHTML = `<button type="button" class="jb-prev" title="Columnas anteriores" aria-label="Columnas anteriores">‹</button><div class="jb-track" title="Arrastra o haz clic para moverte por el tablero"><div class="jb-thumb"></div></div><button type="button" class="jb-next" title="Columnas siguientes" aria-label="Columnas siguientes">›</button><span class="jb-count"></span>`;
    const prev = footer.querySelector(".jb-prev"), next = footer.querySelector(".jb-next"), track = footer.querySelector(".jb-track"), thumb = footer.querySelector(".jb-thumb");
    const step = () => { const col = scroller.querySelector(".jb-col"); return col ? col.getBoundingClientRect().width + 10 : 280; };
    prev.onclick = () => scroller.scrollBy({ left: -step() });
    next.onclick = () => scroller.scrollBy({ left: step() });
    function update() {
      const max = scroller.scrollWidth - scroller.clientWidth;
      const ratio = scroller.scrollWidth ? scroller.clientWidth / scroller.scrollWidth : 1;
      thumb.style.width = Math.min(100, ratio * 100) + "%";
      thumb.style.left = (max > 0 ? (scroller.scrollLeft / max) * (100 - Math.min(100, ratio * 100)) : 0) + "%";
      prev.disabled = scroller.scrollLeft <= 2;
      next.disabled = scroller.scrollLeft >= max - 2;
      track.style.visibility = max > 2 ? "visible" : "hidden";
    }
    function jump(clientX) {
      const r = track.getBoundingClientRect(), max = scroller.scrollWidth - scroller.clientWidth;
      scroller.scrollTo({ left: Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * max, behavior: "auto" });
    }
    let dragging = false;
    track.addEventListener("pointerdown", (e) => { dragging = true; track.setPointerCapture(e.pointerId); jump(e.clientX); });
    track.addEventListener("pointermove", (e) => { if (dragging) jump(e.clientX); });
    track.addEventListener("pointerup", () => { dragging = false; });
    // A vertical wheel over the board's gaps (not inside a column) scrolls sideways.
    scroller.addEventListener("wheel", (e) => {
      if (e.shiftKey || e.target.closest(".jb-col-body")) return;
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && scroller.scrollWidth > scroller.clientWidth) { scroller.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    scroller.addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    const api = {
      update,
      setCount(text) { footer.querySelector(".jb-count").textContent = text; },
      // After re-rendering columns: fit few columns to the width, keep the scroll position.
      refresh(fitWhenFew) {
        const cols = scroller.querySelectorAll(".jb-col").length;
        scroller.classList.toggle("fit", !!fitWhenFew && cols <= (opts.fitMax || 4));
        requestAnimationFrame(update);
      },
      reset() { scroller.scrollTo({ left: 0, behavior: "auto" }); requestAnimationFrame(update); },
    };
    update();
    return api;
  }
  window.JarvisBoard = { attach };
})();
