// POST /api/scaffold-project
// Body: { name: "Tracks Factory" }
//
// Automates most of "Add New Workspace" per Aurelio's request: a new
// project should start with a standard architecture, not be rebuilt from
// scratch every time. This creates:
//   1. A row in the real Projects database
//   2. The 12 standard areas (matching the ONG-derived reference
//      architecture) as real Master Entities rows tagged to it
//   3. A card in the Workspaces database, routed to the generic
//      project-command-center.html?project=<slug> dashboard — which
//      works immediately, no code changes, since project-data.js looks
//      projects up dynamically now
//
// NOT automated here, deliberately: adding the new project as an option
// on Master Actions' "Project" select field. Notion's API requires
// submitting the complete existing options list alongside the new one to
// update a select field safely, and getting that wrong from an untested
// server-side schema PATCH risks silently corrupting the other 7 real
// options. That one step is fast and safe to do directly in Notion (or
// ask Claude to do it, which has already been verified working this
// session) — everything else here is fully automatic.

const NOTION_VERSION = "2025-09-03";
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const BASE = "https://api.notion.com/v1";

const DB_PROJECTS = process.env.NOTION_DB_PROJECTS || "1d136483-524c-4045-b466-109e1f333f1e";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";
const DB_WORKSPACES = process.env.NOTION_DB_WORKSPACES || "0c06b31c-8503-4cf6-85cb-65884d7e7a26";

const STANDARD_AREAS = [
  "Development / Product", "Legal", "Marketing", "Sales", "Operations",
  "Finance", "Content", "Strategy", "Documents", "Tasks", "Meetings", "Knowledge",
];

function slugify(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}
function headers() {
  return { Authorization: `Bearer ${NOTION_TOKEN}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}
async function createPage(dataSourceId, properties) {
  const res = await fetch(`${BASE}/pages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dataSourceId }, properties }),
  });
  if (!res.ok) throw new Error(`Notion create failed (${res.status}): ${await res.text()}`);
  return res.json();
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST" });
    return;
  }
  if (!NOTION_TOKEN) {
    res.status(200).json({ ok: false, error: "NOTION_TOKEN not set" });
    return;
  }

  try {
    const { name } = req.body || {};
    if (!name || !name.trim()) {
      res.status(400).json({ ok: false, error: "name is required" });
      return;
    }
    const projectName = name.trim();
    const slug = slugify(projectName);

    // 1. Projects database row
    const projectPage = await createPage(DB_PROJECTS, {
      "Project Name": { title: [{ text: { content: projectName } }] },
      Status: { select: { name: "Planning" } },
      "Color Theme": { select: { name: "Gray" } },
    });

    // 2. Standard areas in Master Entities
    const areaPages = await Promise.all(
      STANDARD_AREAS.map((area) =>
        createPage(DB_ENTITIES, {
          "Entity Name": { title: [{ text: { content: area } }] },
          Empresa: { select: { name: projectName } },
          Status: { select: { name: "Active" } },
        })
      )
    );

    // 3. Workspaces card
    const wsPage = await createPage(DB_WORKSPACES, {
      Name: { title: [{ text: { content: projectName } }] },
      Description: { rich_text: [{ text: { content: "Proyecto nuevo — estructura estándar generada automáticamente." } }] },
      Icon: { rich_text: [{ text: { content: "🗂️" } }] },
      Route: { url: `/project-command-center.html?project=${slug}` },
      Status: { select: { name: "Live" } },
      Type: { select: { name: "Business" } },
    });

    res.status(200).json({
      ok: true,
      projectPageId: projectPage.id,
      areasCreated: areaPages.length,
      workspacePageId: wsPage.id,
      slug,
      remainingManualStep: `Add "${projectName}" as an option on Master Actions' "Project" select field so tasks can be tagged to it — quick to do in Notion directly, or ask Claude.`,
    });
  } catch (err) {
    console.error(err);
    res.status(200).json({ ok: false, error: err.message });
  }
};
