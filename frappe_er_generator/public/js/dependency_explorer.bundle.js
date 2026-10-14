import cytoscape from "cytoscape";

const METHOD = "frappe_er_generator.frappe_er_generator.dependency_explorer.get_dependency_graph";
const COLORS = { Master: "#d8f3e3", Transaction: "#dceaff", "Child Table": "#f5e6ca" };
let activeDialog = null;

function currentDocType() {
  const route = frappe.get_route();
  if (!route || !["Form", "List"].includes(route[0])) return null;
  return route[1] || null;
}

function graphElements(result) {
  return [
    ...result.nodes.map((n) => ({ data: { ...n, color: COLORS[n.kind] || "#eee" } })),
    ...result.edges.map((e, i) => ({ data: { id: "edge-" + i, ...e } })),
  ];
}

// Shared by the quick preview and the full-page Desk explorer.
function renderGraph(container, result, onNodeClick) {
  const rootSelector = '[id = "' + result.root.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
  const cy = cytoscape({
    container,
    elements: graphElements(result),
    style: [
      { selector: "node", style: { "background-color": "data(color)", label: "data(label)", color: "#233247", "font-size": 11, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": 120, width: "label", height: 36, padding: "15px", "border-color": "#8b9eb1", "border-width": 1, shape: "round-rectangle" } },
      { selector: rootSelector, style: { "border-width": 3, "border-color": "#316bb2" } },
      { selector: "edge", style: { width: 1.5, "line-color": "#99a6b6", "target-arrow-color": "#99a6b6", "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 0.8 } },
      { selector: "node:selected", style: { "border-width": 3, "border-color": "#2274c7" } },
    ],
    layout: { name: "breadthfirst", directed: true, roots: rootSelector, padding: 35, spacingFactor: 1.3 },
    minZoom: 0.15, maxZoom: 3,
  });
  cy.on("tap", "node", (event) => onNodeClick(event.target.data("id")));
  return cy;
}

function graphSummary(result) {
  const c = result.counts;
  return c.doctypes + " DocTypes · " + c.relationships + " relationships · " +
    c.masters + " masters · " + c.transactions + " transactions · " + c.child_tables + " child tables";
}

function openExplorer() {
  if (activeDialog) return;
  const doctype = currentDocType();
  if (!doctype) {
    frappe.show_alert({ message: __("Open a DocType Form or List first"), indicator: "orange" });
    return;
  }
  const dialog = new frappe.ui.Dialog({
    title: __("DocType Dependency Explorer"),
    size: "extra-large",
    fields: [
      { fieldname: "doctype", fieldtype: "Link", options: "DocType", label: __("Root DocType"), reqd: 1, default: doctype },
      { fieldname: "depth", fieldtype: "Int", label: __("Depth"), default: 2, reqd: 1 },
      { fieldname: "direction", fieldtype: "Select", label: __("Direction"), options: "both\nincoming\noutgoing", default: "both" },
      { fieldname: "include_child_tables", fieldtype: "Check", label: __("Include Child Tables"), default: 0 },
      { fieldname: "column", fieldtype: "Column Break" },
      { fieldname: "legend", fieldtype: "HTML", options: '<div style="font-size:12px">🟩 Master (non-submittable) &nbsp; 🟦 Transaction (submittable) &nbsp; 🟨 Child Table</div>' },
      { fieldname: "graph", fieldtype: "HTML" },
    ],
    primary_action_label: __("Explore"),
    primary_action: async (values) => {
      const container = dialog.fields_dict.graph.$wrapper;
      try {
        const response = await frappe.call({ method: METHOD, args: values, freeze: true });
        const result = response.message;
        if (!result) return;
        const summary = $('<div class="small text-muted" style="margin:8px 0"></div>').text(graphSummary(result));
        const controls = $('<div style="margin:8px 0;display:flex;gap:8px"></div>');
        const fitButton = $('<button type="button" class="btn btn-xs btn-default"></button>').text(__("Fit to screen"));
        const zoomInButton = $('<button type="button" class="btn btn-xs btn-default">+</button>');
        const zoomOutButton = $('<button type="button" class="btn btn-xs btn-default">−</button>');
        controls.append(fitButton, zoomInButton, zoomOutButton);
        const graphBox = $('<div style="width:100%;height:55vh;min-height:340px;border:1px solid var(--border-color);border-radius:8px"></div>');
        if (dialog._dependencyCy) dialog._dependencyCy.destroy();
        container.empty().append(summary, controls, graphBox);
        dialog._dependencyCy = renderGraph(graphBox[0], result, (name) => {
          dialog.hide();
          frappe.set_route("Form", "DocType", name);
        });
        fitButton.on("click", () => dialog._dependencyCy.fit(undefined, 35));
        zoomInButton.on("click", () => dialog._dependencyCy.zoom({ level: Math.min(3, dialog._dependencyCy.zoom() * 1.2), renderedPosition: { x: graphBox.width() / 2, y: graphBox.height() / 2 } }));
        zoomOutButton.on("click", () => dialog._dependencyCy.zoom({ level: Math.max(0.15, dialog._dependencyCy.zoom() / 1.2), renderedPosition: { x: graphBox.width() / 2, y: graphBox.height() / 2 } }));
      } catch (error) {
        console.error("Dependency explorer:", error);
        frappe.msgprint(__("Unable to load DocType dependencies. Check permissions and server logs."));
      }
    },
  });
  dialog.set_secondary_action(__("Open in New Tab"), () => {
    const values = dialog.get_values();
    if (!values) return;
    if (+values.depth < 1 || +values.depth > 6) {
      frappe.msgprint(__("Depth must be between 1 and 6"));
      return;
    }
    const params = new URLSearchParams({
      doctype: values.doctype,
      depth: String(values.depth),
      direction: values.direction || "both",
      include_child_tables: values.include_child_tables ? "1" : "0",
    });
    window.open("/app/doctype-dependency-explorer?" + params.toString(), "_blank", "noopener");
  });
  activeDialog = dialog;
  dialog.onhide = () => {
    if (dialog._dependencyCy) dialog._dependencyCy.destroy();
    activeDialog = null;
  };
  dialog.show();
}

window.frappeERDependencyOpen = openExplorer;
window.frappeERDependencyRenderGraph = renderGraph;
window.frappeERDependencyGraphSummary = graphSummary;
