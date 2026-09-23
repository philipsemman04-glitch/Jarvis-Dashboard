// POST /api/penny-ai
// Server-side project assistant endpoint. The provider key never reaches the browser.
const MODEL = process.env.JARVIS_AI_MODEL || "claude-sonnet-4-6";

function providerConfig() {
  const rawBase = process.env.BUILT_IN_FORGE_API_URL || process.env.OPENAI_API_BASE || "";
  const key = process.env.BUILT_IN_FORGE_API_KEY || process.env.OPENAI_API_KEY || "";
  if (!rawBase || !key) return null;
  const base = rawBase.replace(/\/$/, "");
  const url = /\/v1$/i.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
  return { url, key };
}

function compactContext(context = {}) {
  return {
    project: context.project || "Jarvis",
    period: context.period || "month",
    totals: context.totals || {},
    tasks: Array.isArray(context.tasks) ? context.tasks.slice(0, 60).map(t => ({
      name: t.taskName || t.name,
      status: t.status,
      priority: t.priority,
      priorityLevel: t.priorityLevel,
      area: t.area,
      owner: t.owner,
      targetDate: t.targetDate,
      description: String(t.description || "").slice(0, 600),
    })) : [],
  };
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  if (req.method !== "POST") { res.status(405).json({ error: "POST required" }); return; }
  const { message, history = [], context = {} } = req.body || {};
  if (!message || !String(message).trim()) { res.status(400).json({ error: "message is required" }); return; }
  const cfg = providerConfig();
  if (!cfg) {
    res.status(503).json({ error: "Penny AI is not configured yet. Add the server-side AI provider variables before using chat." });
    return;
  }
  const projectContext = compactContext(context);
  const system = `You are Penny, the strategic assistant inside Jarvis for the ${projectContext.project} project. Answer only from the supplied ${projectContext.project} context. Do not invent task facts, dates, owners, counts, or Notion properties. If the context does not contain the answer, say that clearly and suggest what Aurelio should check. Be concise, practical, and action-oriented. You may summarize, compare priorities, identify overdue or blocked work, and recommend next steps, but do not claim to have changed Notion. Current context JSON:\n${JSON.stringify(projectContext)}`;
  const messages = [
    { role: "system", content: system },
    ...Array.isArray(history) ? history.slice(-10).filter(x => x && (x.role === "user" || x.role === "assistant")).map(x => ({ role: x.role, content: String(x.content || "").slice(0, 4000) })) : [],
    { role: "user", content: String(message).trim().slice(0, 4000) },
  ];
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: MODEL, messages, max_tokens: 900 }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error?.message || `AI provider returned ${r.status}`);
    const answer = data.choices?.[0]?.message?.content || data.output_text || data.content?.[0]?.text;
    if (!answer) throw new Error("AI provider returned an empty answer");
    res.status(200).json({ ok: true, answer, model: MODEL });
  } catch (err) {
    console.error(err);
    res.status(502).json({ error: err.message });
  }
};
