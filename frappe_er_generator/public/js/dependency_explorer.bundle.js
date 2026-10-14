import cytoscape from "cytoscape";

const METHOD = "frappe_er_generator.frappe_er_generator.dependency_explorer.get_dependency_graph";
const COLORS = { Master: "#d8f3e3", Transaction: "#dceaff", "Child Table": "#f5e6ca" };
let activeDialog = null;

function currentDocType() {
  const route = frappe.get_route();
  if (!route || !["Form", "List"].includes(route[0])) return null;
  // Standard Desk routes are Form/<DocType>/<name> and List/<DocType>.
  return route[1] || null;
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
        const summary = $('<div class="small text-muted" style="margin:8px 0"></div>');
        summary.text(`${result.counts.doctypes} DocTypes · ${result.counts.relationships} relationships · ${result.counts.masters} masters · ${result.counts.transactions} transactions`);
        const graphBox = $('<div style="width:100%;height:55vh;min-height:340px;border:1px solid var(--border-color);border-radius:8px"></div>');
        container.empty().append(summary, graphBox);
        if (dialog._dependencyCy) dialog._dependencyCy.destroy();
        const elements = [
          ...result.nodes.map((n) => ({ data: { ...n, color: COLORS[n.kind] || "#eee" } })),
          ...result.edges.map((e, i) => ({ data: { id: `edge-${i}`, ...e } })),
        ];
        dialog._dependencyCy = cytoscape({
          container: graphBox[0], elements,
          style: [
            { selector: "node", style: { "background-color": "data(color)", label: "data(label)", color: "#233247", "font-size": 11, "text-valign": "center", "text-halign": "center", "text-wrap": "wrap", "text-max-width": 120, width: "label", height: 36, padding: "15px", "border-color": "#8b9eb1", "border-width": 1, shape: "round-rectangle" } },
            { selector: 'node[id = "' + result.root.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]', style: { "border-width": 3, "border-color": "#316bb2" } },
            { selector: "edge", style: { width: 1.5, "line-color": "#99a6b6", "target-arrow-color": "#99a6b6", "target-arrow-shape": "triangle", "curve-style": "bezier", "arrow-scale": 0.8 } },
            { selector: "node:selected", style: { "border-width": 3, "border-color": "#2274c7" } },
          ],
          layout: { name: "breadthfirst", directed: true, roots: '[id = "' + result.root.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"]', padding: 35, spacingFactor: 1.3 },
          minZoom: 0.15, maxZoom: 3,
        });
        dialog._dependencyCy.on("tap", "node", (event) => {
          const name = event.target.data("id");
          dialog.hide();
          frappe.set_route("Form", "DocType", name);
        });
      } catch (error) {
        console.error("Dependency explorer:", error);
        frappe.msgprint(__("Unable to load DocType dependencies. Check permissions and server logs."));
      }
    },
  });
  activeDialog = dialog;
  dialog.onhide = () => {
    if (dialog._dependencyCy) dialog._dependencyCy.destroy();
    activeDialog = null;
  };
  dialog.show();
}

$(document).on("keydown.frappeERDependency", function (event) {
  if (!(event.altKey && event.shiftKey && event.code === "Slash")) return;
  if (event.ctrlKey || event.metaKey || event.repeat) return;
  const target = $(event.target);
  if (target.is("input,textarea,select") || target.closest('[contenteditable="true"],.modal').length) return;
  if (!currentDocType()) return;
  event.preventDefault();
  openExplorer();
});
