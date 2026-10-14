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

// Built-in Cytoscape layouts only: no extra extension or build dependency.
const LAYOUTS = ["hierarchical", "left-to-right", "radial", "force", "grid"];

function normalizedLayout(name) {
  return LAYOUTS.includes(name) ? name : "hierarchical";
}

function graphLayout(cy, root, name) {
  const layout = normalizedLayout(name);
  const rootNode = cy.getElementById(root);
  const common = { padding: 45, fit: true, animate: false };
  if (layout === "hierarchical" || layout === "left-to-right") {
    return {
      ...common, name: "breadthfirst", directed: true,
      roots: rootNode, circle: false,
      spacingFactor: 1.4, avoidOverlap: true,
      nodeDimensionsIncludeLabels: true,
      maximal: false,
      ...(layout === "left-to-right" ? { transform: (_node, position) => ({ x: position.y, y: position.x }) } : {}),
    };
  }
  if (layout === "radial") {
    return {
      ...common, name: "concentric",
      concentric: (node) => Math.max(0, 7 - (Number(node.data("level")) || 0)),
      levelWidth: () => 1, minNodeSpacing: 45,
      startAngle: -Math.PI / 2, clockwise: true,
      equidistant: true, avoidOverlap: true,
    };
  }
  if (layout === "force") {
    return {
      ...common, name: "cose", randomize: false,
      nodeRepulsion: () => 650000, nodeOverlap: 22,
      idealEdgeLength: () => 145, edgeElasticity: () => 90,
      numIter: 600, gravity: 0.7,
    };
  }
  return { ...common, name: "grid", avoidOverlap: true, condense: false, rows: undefined, cols: undefined };
}

function applyGraphLayout(cy, root, name) {
  if (!cy || cy.destroyed()) return;
  cy.layout(graphLayout(cy, root, name)).run();
}

// Shared by the quick preview and the full-page Desk explorer.
function renderGraph(container, result, onNodeClick, layoutName = "hierarchical", onEdgeClick = null) {
  const rootSelector = '[id = "' + result.root.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]';
  const cy = cytoscape({
    container,
    elements: graphElements(result),
    style: [
      { selector: "node", style: { "background-color": "data(color)", label: "data(label)", color: "#233247", "font-size": 11, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": 120, width: "label", height: 36, padding: "15px", "border-color": "#8b9eb1", "border-width": 1, shape: "round-rectangle" } },
      { selector: rootSelector, style: { "border-width": 3, "border-color": "#316bb2" } },
      { selector: "edge", style: { width: 1.5, "line-color": "#99a6b6", "target-arrow-color": "#99a6b6", "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 0.8 } },
      { selector: "node:selected", style: { "border-width": 3, "border-color": "#2274c7" } },
      { selector: "edge:selected", style: { width: 4, "line-color": "#2274c7", "target-arrow-color": "#2274c7" } },
    ],
    layout: { name: "preset" },
    minZoom: 0.15, maxZoom: 3,
  });
  applyGraphLayout(cy, result.root, layoutName);
  cy.on("tap", "node", (event) => onNodeClick(event.target.data("id")));
  if (onEdgeClick) cy.on("tap", "edge", (event) => onEdgeClick(event.target.data()));
  return cy;
}

// Only metadata from the existing graph API is displayed; no document records are queried.
function relationshipInspector(container, edge) {
  const panel = $(container);
  panel.empty();
  if (!edge) {
    panel.append($("<span></span>").text(__("Select a connecting line to inspect its relationship.")));
    return;
  }
  const title = $("<strong></strong>").text(__("Relationship details"));
  const fields = [
    [__("Source DocType"), edge.source],
    [__("Target DocType"), edge.target],
    [__("Linking field"), edge.fieldname || __("Not available")],
    [__("Field type"), edge.fieldtype || __("Not available")],
  ];
  const table = $('<div style="display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;margin-top:8px"></div>');
  fields.forEach(([label, value]) => {
    table.append($("<span class='text-muted'></span>").text(label));
    table.append($("<span></span>").text(value));
  });
  panel.append(title, table);
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
      { fieldname: "depth", fieldtype: "Int", label: __("Depth"), default: 1, reqd: 1 },
      { fieldname: "direction", fieldtype: "Select", label: __("Direction"), options: "outgoing\nincoming\nboth", default: "outgoing" },
      { fieldname: "include_child_tables", fieldtype: "Check", label: __("Include Child Tables"), default: 0 },
      { fieldname: "column", fieldtype: "Column Break" },
      { fieldname: "legend", fieldtype: "HTML", options: '<div style="font-size:12px">🟩 Master (non-submittable) &nbsp; 🟦 Transaction (submittable) &nbsp; 🟨 Child Table</div>' },
      { fieldname: "layout", fieldtype: "Select", label: __("Graph Layout"), options: "hierarchical\nleft-to-right\nradial\nforce\ngrid", default: "hierarchical" },
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
        const newTabButton = $('<button type="button" class="btn btn-sm btn-primary"></button>')
          .text(__("Open Full Page ↗"))
          .attr("title", __("Open dependency graph in a new browser tab"))
          .on("click", openFullPage);
        controls.append(newTabButton, fitButton, zoomInButton, zoomOutButton);
        const graphBox = $('<div style="width:100%;height:55vh;min-height:340px;border:1px solid var(--border-color);border-radius:8px"></div>');
        const details = $('<div class="small" role="status" aria-live="polite" style="padding:10px;margin-top:8px;border:1px solid var(--border-color);border-radius:6px"></div>');
        relationshipInspector(details, null);
        if (dialog._dependencyCy) dialog._dependencyCy.destroy();
        container.empty().append(summary, controls, graphBox, details);
        dialog._dependencyCy = renderGraph(graphBox[0], result, (name) => {
          dialog.hide();
          frappe.set_route("Form", "DocType", name);
        }, values.layout, (edge) => relationshipInspector(details, edge));
        fitButton.on("click", () => dialog._dependencyCy.fit(undefined, 35));
        zoomInButton.on("click", () => dialog._dependencyCy.zoom({ level: Math.min(3, dialog._dependencyCy.zoom() * 1.2), renderedPosition: { x: graphBox.width() / 2, y: graphBox.height() / 2 } }));
        zoomOutButton.on("click", () => dialog._dependencyCy.zoom({ level: Math.max(0.15, dialog._dependencyCy.zoom() / 1.2), renderedPosition: { x: graphBox.width() / 2, y: graphBox.height() / 2 } }));
      } catch (error) {
        console.error("Dependency explorer:", error);
        frappe.msgprint(__("Unable to load DocType dependencies. Check permissions and server logs."));
      }
    },
  });
  const openFullPage = () => {
    const values = dialog.get_values();
    if (!values) return;
    if (+values.depth < 1 || +values.depth > 6) {
      frappe.msgprint(__("Depth must be between 1 and 6"));
      return;
    }
    const params = new URLSearchParams({
      doctype: values.doctype,
      depth: String(values.depth),
      direction: values.direction || "outgoing",
      include_child_tables: values.include_child_tables ? "1" : "0",
      layout: normalizedLayout(values.layout),
    });
    window.open("/app/doctype-dependency-explorer?" + params.toString(), "_blank", "noopener");
  };
  dialog.set_secondary_action(openFullPage, __("Open in New Tab"));
  activeDialog = dialog;
  dialog.onhide = () => {
    if (dialog._dependencyCy) dialog._dependencyCy.destroy();
    activeDialog = null;
  };
  dialog.show();
  // Header action remains visible before and after graph generation.
  const headerButton = $('<button type="button" class="btn btn-sm btn-primary" style="margin-left:12px"></button>')
    .text(__("Open Full Page ↗"))
    .attr("title", __("Open diagram in a new browser tab"))
    .on("click", openFullPage);
  dialog.$wrapper.find(".modal-header .modal-title").first().after(headerButton);
}

window.frappeERDependencyOpen = openExplorer;
window.frappeERDependencyRenderGraph = renderGraph;
window.frappeERDependencyGraphSummary = graphSummary;
window.frappeERDependencyRelationshipInspector = relationshipInspector;

window.frappeERDependencyApplyLayout = applyGraphLayout;
window.frappeERDependencyNormalizeLayout = normalizedLayout;
