const {
  queryDatabase,
  getTitle,
  getRichText,
  getSelect,
  getCheckbox,
  getNumber,
  getDate,
  getRelationIds,
} = require("./_notion");

/**
 * Database IDs — confirmed against the real workspace schema on Aug 11.
 * Override any of these in Vercel → Settings → Environment Variables.
 */
const DB_ACTIONS = process.env.NOTION_DB_ACTIONS || "de671725-0aef-44f7-9ec4-a577b1c7e254";
const DB_ENTITIES = process.env.NOTION_DB_ENTITIES || "f964fea0-c3d9-478b-8790-7eaa70a19b00";
const DB_DECISIONS = process.env.NOTION_DB_DECISIONS || "50b48347-9a7f-48a2-8876-ed3381a285ab";
const DB_BUDGET = process.env.NOTION_DB_BUDGET || "413469f4-5f82-47d3-9f23-fed8fd6ff4d4";
const DB_CRM_LEADS = process.env.NOTION_DB_CRM_LEADS || "3b43ee78-69f9-4ccf-9f18-25c0f220b398";

// Same definition of "open/active" used on the Jarvis Home screen
// (workspaces-data.js) — kept identical on purpose so the two numbers
// always mean the same thing and can be reconciled against each other.
const OPEN_STATUSES = ["No iniciado", "Preparación", "En progreso", "En revisión", "En validación", "Bloqueado"];
const CLOSED_STATUSES = ["Terminado", "Cancelado"];

module.exports = async (req, res) => {
  try {
    const [actionPages, entityPages] = await Promise.all([
      queryDatabase(DB_ACTIONS, {
        filter: { property: "Project", select: { equals: "One Night Guest" } },
        sorts: [{ property: "Priority", direction: "ascending" }],
      }),
      queryDatabase(DB_ENTITIES, {}),
    ]);

    // FIX (Aug 15, round 2): Master Actions already has a "Related Entity"
    // relation to Master Entities, populated on 219 of 223 real tasks
    // workspace-wide — this data existed the whole time, but no dashboard
    // ever read it, so the area was always blank. Resolving id → name here.
    const entityNameById = {};
    entityPages.forEach((p) => { entityNameById[p.id] = getTitle(p.properties, "Entity Name"); });

    const actions = actionPages.map((p) => {
      const props = p.properties;
      const entityIds = getRelationIds(props, "Related Entity");
      return {
        id: p.id,
        notionUrl: p.url,
        taskName: getTitle(props, "Task Name"),
        status: getSelect(props, "Status"),
        priority: getSelect(props, "Priority"),
        blocksLaunch: getCheckbox(props, "Blocks Launch"),
        nextAction: getRichText(props, "Next Action"),
        completionCriteria: getRichText(props, "Completion Criteria"),
        targetDate: getDate(props, "Target Date"),
        area: entityIds.length ? (entityNameById[entityIds[0]] || null) : null,
      };
    });

    // FIX (Aug 15): "Critical" used to only exclude "Terminado", which
    // meant 2 real but CANCELLED P0 tasks were being counted as critical
    // — tasks nobody needs to act on. Now excludes every closed status.
    const critical = actions.filter((a) => a.priority === "P0" && !CLOSED_STATUSES.includes(a.status)).length;
    const onTrack = actions.filter((a) => a.status === "En progreso").length;

    // Real, reconciling breakdown — this always sums to openTotal exactly,
    // unlike "Critical"/"On Track" above which are different, overlapping
    // lenses (by priority vs. by exact status) on the same task pool, not
    // parts of a whole. Exposed so the dashboard can show its arithmetic
    // honestly instead of implying three numbers that don't sum are wrong.
    const statusBreakdown = {};
    OPEN_STATUSES.forEach((s) => (statusBreakdown[s] = 0));
    actions.forEach((a) => {
      if (OPEN_STATUSES.includes(a.status)) statusBreakdown[a.status]++;
    });
    const openTotal = Object.values(statusBreakdown).reduce((a, b) => a + b, 0);

    // FIX (Aug 15): candidates are now also sorted by target date (soonest
    // first, undated last) as a tiebreaker within the same priority, so
    // "Do Now" isn't just "whichever row happens to sort first."
    const byTargetDate = (a, b) => {
      if (!a.targetDate && !b.targetDate) return 0;
      if (!a.targetDate) return 1;
      if (!b.targetDate) return -1;
      return a.targetDate.localeCompare(b.targetDate);
    };
    const blockingP0 = actions
      .filter((a) => a.blocksLaunch && !CLOSED_STATUSES.includes(a.status) && a.priority === "P0")
      .sort(byTargetDate);
    const anyOpenP0 = actions
      .filter((a) => !CLOSED_STATUSES.includes(a.status) && a.priority === "P0")
      .sort(byTargetDate);
    const nextActionRow = blockingP0[0] || anyOpenP0[0] || null;

    // ---- Decisions awaiting input (separate database — NOT part of
    // Master Actions, so this count is never meant to reconcile with the
    // task totals above; the frontend now labels it as its own source) ----
    let decisionsOpen = [];
    try {
      const decisionPages = await queryDatabase(DB_DECISIONS, {
        filter: {
          or: [
            { property: "Status", status: { equals: "Pending" } },
            { property: "Status", status: { equals: "Under review" } },
          ],
        },
      });
      decisionsOpen = decisionPages.map((p) => ({
        id: p.id,
        notionUrl: p.url,
        title: getTitle(p.properties, "Decision"),
      }));
    } catch (e) {
      /* Decisions DB may not be shared yet — degrade gracefully */
    }

    let mrrActual = null;
    try {
      const budgetPages = await queryDatabase(DB_BUDGET, {
        filter: { property: "Item Name", title: { contains: "MRR" } },
      });
      if (budgetPages[0]) {
        mrrActual = getNumber(budgetPages[0].properties, "Actual");
      }
    } catch (e) {
      /* Budget DB may not be shared yet */
    }

    let totalLeads = null;
    let funnel = [];
    try {
      const leadPages = await queryDatabase(DB_CRM_LEADS, {});
      const realLeadPages = leadPages.filter((p) => !getTitle(p.properties, "Lead Name").startsWith("[SAMPLE]"));
      totalLeads = realLeadPages.length;
      const stageCounts = {};
      realLeadPages.forEach((p) => {
        const stage = getSelect(p.properties, "Funnel Stage") || "Unknown";
        stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      });
      funnel = Object.entries(stageCounts).map(([stage, count]) => ({ stage, count }));
    } catch (e) {
      /* CRM Leads DB may not be shared yet */
    }

    // Real, live area breakdown — how many open tasks per area, computed
    // from the "Related Entity" relation that already existed on 219/223
    // tasks but was never surfaced anywhere before.
    const areaBreakdown = {};
    actions.forEach((a) => {
      if (a.area && OPEN_STATUSES.includes(a.status)) {
        areaBreakdown[a.area] = (areaBreakdown[a.area] || 0) + 1;
      }
    });

    res.status(200).json({
      source: "notion-live",
      fetchedAt: new Date().toISOString(),
      project: { name: "One Night Guest", shortName: "ONG" },
      stats: {
        critical,
        decisions: decisionsOpen.length,
        onTrack,
        openTotal,
        statusBreakdown,
        areaBreakdown,
        mrrActual: mrrActual ?? undefined,
        totalLeads: totalLeads ?? undefined,
        leadsPeriod: "Live from Notion",
      },
      nextAction: nextActionRow
        ? {
            id: nextActionRow.id,
            notionUrl: nextActionRow.notionUrl,
            taskName: nextActionRow.taskName,
            blocksLaunch: nextActionRow.blocksLaunch,
            dueLabel: nextActionRow.targetDate ? `Due ${nextActionRow.targetDate}` : "No date set",
            // FIX (Aug 15): removed the hardcoded "impact: 90" — there is no
            // real field in Notion behind an "impact score" for any task.
            // Do not reintroduce this without a real source.
            why: nextActionRow.nextAction || nextActionRow.completionCriteria || "",
          }
        : null,
      blockersAndDecisions: [
        ...actions
          .filter((a) => a.status === "Bloqueado")
          .map((a) => ({ id: a.id, notionUrl: a.notionUrl, title: a.taskName, type: "Blocked", severity: "critical", area: a.area || "", source: "Master Actions" })),
        ...decisionsOpen.map((d) => ({ id: d.id, notionUrl: d.notionUrl, title: d.title, type: "Decision", severity: "decision", area: "", source: "Decision Log" })),
      ],
      funnel,
      allActions: actions,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
