// GET /api/system-health
// Actually pings every core database (a single-row query, not a full
// paginated fetch — this just needs to confirm the connection works,
// not read everything) and reports real pass/fail with the real error
// message on failure. Nothing here is a static "looks fine" — every
// status shown is checked at request time.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;

const DATABASES = [
  { name: "Master Actions", id: "de671725-0aef-44f7-9ec4-a577b1c7e254", powers: "Tareas & Proyectos, ONG, RoutePup/Nikita/StatStrike, Personal OS" },
  { name: "Master Entities", id: "f964fea0-c3d9-478b-8790-7eaa70a19b00", powers: "Áreas por proyecto en cada Command Center" },
  { name: "Projects", id: "1d136483-524c-4045-b466-109e1f333f1e", powers: "Lista maestra de los 7 proyectos reales" },
  { name: "Workspaces", id: "0c06b31c-8503-4cf6-85cb-65884d7e7a26", powers: "Tarjetas de la pantalla de Inicio" },
  { name: "Decision Log", id: "50b48347-9a7f-48a2-8876-ed3381a285ab", powers: "Panel de Decisiones en ONG" },
  { name: "Budget / KPIs", id: "413469f4-5f82-47d3-9f23-fed8fd6ff4d4", powers: "MRR en ONG (si existe una fila con 'MRR')" },
  { name: "CRM / Leads", id: "3b43ee78-69f9-4ccf-9f18-25c0f220b398", powers: "Total Leads y embudo en ONG" },
  { name: "Referencias", id: "7456b43c-50ef-4e15-bea4-ab2f824add71", powers: "Todo Mis Gustos & Aprendizajes" },
  { name: "Personal Goals", id: "4a17bbaa-edf8-44b6-8363-23aa9150ff6e", powers: "Metas Personales en Personal OS" },
  { name: "Habits", id: "d6385a58-5315-47a7-a79d-af1002c479e3", powers: "Hábitos diarios en Personal OS" },
  { name: "Rutina — Registro Diario", id: "34c19c0f-73ef-41eb-9f0c-17d52c2ef116", powers: "Rutina en Personal OS y Calendario" },
  { name: "Aristóteles — Documentos", id: "650f515d-4540-4a67-9066-f04b0944e394", powers: "Toda la página de Aristóteles" },
  { name: "RoutePup — Tarjetas", id: "f9fc7996-b03d-4ed2-bb16-fa2d616d8e46", powers: "Dashboard de RoutePup" },
];

async function pingDataSource(id) {
  const start = Date.now();
  try {
    const res = await fetch(`https://api.notion.com/v1/data_sources/${id}/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${NOTION_TOKEN}`,
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ page_size: 1 }),
    });
    const ms = Date.now() - start;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, ms, error: body.message || `HTTP ${res.status}` };
    }
    return { ok: true, ms };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, error: err.message };
  }
}

module.exports = async (req, res) => {
  if (!NOTION_TOKEN) {
    res.status(200).json({
      checkedAt: new Date().toISOString(),
      tokenPresent: false,
      results: DATABASES.map((d) => ({ ...d, ok: false, error: "NOTION_TOKEN not set" })),
    });
    return;
  }

  const results = await Promise.all(
    DATABASES.map(async (d) => ({ ...d, ...(await pingDataSource(d.id)) }))
  );

  res.status(200).json({
    checkedAt: new Date().toISOString(),
    tokenPresent: true,
    healthyCount: results.filter((r) => r.ok).length,
    totalCount: results.length,
    results,
  });
};
