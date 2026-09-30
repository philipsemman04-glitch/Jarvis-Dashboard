/*
 * Editable page cover, shared by pages whose banner belongs to a row of the
 * Notion Workspaces database. JarvisCover.attach({ workspace, banner, title,
 * subtitle, button }) shows the saved cover/title/description on load and
 * opens an editor (title, description, cover image) from the button.
 */
(function () {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cssUrl = (u) => { try { const x = new URL(String(u), location.origin); return /^https?:$/.test(x.protocol) ? `url("${x.href.replace(/"/g, "%22")}")` : ""; } catch (e) { return ""; } };
  let loaded = null;
  const workspaces = () => (loaded = loaded || fetch("/api/workspaces-data", { cache: "no-store" }).then((r) => r.json()).then((d) => d.workspaces || []));

  const style = document.createElement("style");
  style.textContent = `.jc-bg{position:fixed;inset:0;background:#000b;display:none;align-items:center;justify-content:center;padding:16px;z-index:200;font-family:Inter,system-ui,sans-serif}
.jc-modal{background:#0f1f32;border:1px solid #8ec3ee47;border-radius:14px;padding:20px;width:min(480px,100%);color:#f3f1ea}
.jc-modal h2{margin:0 0 4px;font-family:Fraunces,Georgia,serif;font-weight:600;font-size:21px}.jc-modal p{margin:0 0 12px;color:#a5b5c4;font-size:12px}
.jc-modal label{display:flex;flex-direction:column;gap:5px;font-size:11px;color:#a5b5c4;font-weight:700;margin-top:10px}
.jc-modal input,.jc-modal textarea{background:#0a1829;border:1px solid #8ec3ee47;color:#f3f1ea;border-radius:9px;padding:9px 11px;font:13px Inter,system-ui,sans-serif}
.jc-prev{height:90px;border-radius:9px;border:1px solid #8ec3ee47;background:#0a1829 center/cover no-repeat;margin-top:6px}
.jc-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.jc-actions button{border:1px solid #8ec3ee47;background:#0c1c2e;color:#f3f1ea;border-radius:9px;padding:8px 14px;font-weight:700;cursor:pointer}
.jc-actions .jc-save{background:linear-gradient(135deg,#f2d27e,#cf9f3f);color:#1f1606;border-color:#f3da8f}`;
  document.head.appendChild(style);

  async function resize(file) {
    if (!/^image\//.test(file.type)) throw new Error("Elige una imagen (JPG, PNG o WebP).");
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
    const k = Math.min(1, 1800 / Math.max(img.width, img.height)), c = document.createElement("canvas");
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.86);
  }

  function attach(opts) {
    let row = null;
    const apply = (r) => {
      if (r.coverUrl && opts.banner && cssUrl(r.coverUrl)) opts.banner.style.backgroundImage = cssUrl(r.coverUrl);
      if (opts.title && r.displayName) opts.title.textContent = r.displayName;
      if (opts.subtitle && r.description) opts.subtitle.textContent = r.description;
    };
    workspaces().then((list) => { row = list.find((w) => w.name === opts.workspace || w.canonicalName === opts.workspace); if (row) apply(row); }).catch(() => {});
    opts.button?.addEventListener("click", async () => {
      if (!row) { try { row = (await workspaces()).find((w) => w.name === opts.workspace || w.canonicalName === opts.workspace); } catch (e) {} }
      if (!row) { window.jarvisToast?.error(null, `No se encontró “${opts.workspace}” en Workspaces de Notion.`); return; }
      const bg = document.createElement("div"); bg.className = "jc-bg"; bg.style.display = "flex";
      bg.innerHTML = `<div class="jc-modal"><h2>Editar portada</h2><p>Cambia la imagen, el título o la descripción. Se guarda en Notion.</p>
        <label>Título<input id="jc-title" value="${esc(row.displayName || row.name)}"></label>
        <label>Descripción<textarea id="jc-desc" rows="2">${esc(row.description || "")}</textarea></label>
        <label>Imagen de portada<input id="jc-file" type="file" accept="image/*"></label><div class="jc-prev" id="jc-prev" style="background-image:${cssUrl(row.coverUrl || "") || "none"}"></div>
        <div class="jc-actions"><button type="button" id="jc-cancel">Cancelar</button><button type="button" class="jc-save" id="jc-save">Guardar cambios</button></div></div>`;
      document.body.appendChild(bg);
      const close = () => bg.remove();
      bg.addEventListener("mousedown", (e) => { if (e.target === bg) close(); });
      bg.querySelector("#jc-cancel").onclick = close;
      bg.querySelector("#jc-file").onchange = (e) => { const f = e.target.files[0]; if (f) bg.querySelector("#jc-prev").style.backgroundImage = `url("${URL.createObjectURL(f)}")`; };
      bg.querySelector("#jc-save").onclick = async () => {
        const btn = bg.querySelector("#jc-save"); btn.disabled = true;
        const t = window.jarvisToast?.loading("Guardando portada…");
        try {
          const body = { workspaceId: row.id, name: bg.querySelector("#jc-title").value.trim(), description: bg.querySelector("#jc-desc").value };
          const file = bg.querySelector("#jc-file").files[0];
          if (file) Object.assign(body, { coverDataBase64: await resize(file), coverFilename: file.name.replace(/\.\w+$/, "") + ".jpg", coverContentType: "image/jpeg" });
          const r = await fetch("/api/workspaces-data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const d = await r.json().catch(() => ({}));
          if (!r.ok || d.error || d.ok === false) throw new Error(d.error || "Error " + r.status);
          loaded = null;
          row = (await workspaces()).find((w) => w.id === row.id) || row;
          apply(row);
          window.jarvisToast?.success(t, "Portada guardada");
          close();
        } catch (e) { btn.disabled = false; window.jarvisToast?.error(t, "No se pudo guardar: " + e.message); }
      };
    });
  }
  window.JarvisCover = { attach };
})();
