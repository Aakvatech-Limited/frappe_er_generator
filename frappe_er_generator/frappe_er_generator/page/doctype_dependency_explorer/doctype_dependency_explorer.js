/* Dedicated full-page Cytoscape viewer. Source bundle loads lazily. */
frappe.pages["doctype-dependency-explorer"].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: __("DocType Dependency Explorer"),
    single_column: true,
  });
  const container = $(page.body);
  container.empty().append(
    '<div class="dependency-full-page">' +
      '<div class="dependency-controls" style="display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:12px 0"></div>' +
      '<div class="dependency-summary small text-muted" style="margin:8px 0"></div>' +
      '<div class="dependency-graph" style="height:calc(100vh - 235px);min-height:440px;width:100%;border:1px solid var(--border-color);border-radius:8px"></div>' +
    '</div>'
  );
  const controls = container.find(".dependency-controls");
  function input(label, html) {
    const block = $('<label style="display:flex;flex-direction:column;gap:4px;font-weight:normal;margin:0"></label>');
    block.append($("<span></span>").text(label), html);
    controls.append(block);
    return html;
  }
  const doctypeInput = input(__("Root DocType"), $('<input class="form-control input-sm" style="width:190px" type="text" />'));
  const depthInput = input(__("Depth"), $('<input class="form-control input-sm" style="width:72px" type="number" min="1" max="6" />'));
  const directionInput = input(__("Direction"), $('<select class="form-control input-sm"><option value="both">Both</option><option value="incoming">Incoming</option><option value="outgoing">Outgoing</option></select>'));
  const childInput = input(__("Child tables"), $('<input type="checkbox" style="margin:9px 0" />'));
  const layoutInput = input(__("Graph layout"), $('<select class="form-control input-sm"><option value="hierarchical">Hierarchical</option><option value="left-to-right">Left to right</option><option value="radial">Radial</option><option value="force">Force directed</option><option value="grid">Grid</option></select>'));
  const findInput = input(__("Find node"), $('<input class="form-control input-sm" style="width:160px" type="search" placeholder="DocType name" />'));
  const findButton = $('<button type="button" class="btn btn-default btn-sm"></button>').text(__("Find"));
  const exploreButton = $('<button type="button" class="btn btn-primary btn-sm"></button>').text(__("Explore"));
  const fitButton = $('<button type="button" class="btn btn-default btn-sm"></button>').text(__("Fit to screen"));
  const zoomInButton = $('<button type="button" class="btn btn-default btn-sm"></button>').text("+");
  const zoomOutButton = $('<button type="button" class="btn btn-default btn-sm"></button>').text("−");
  const previousButton = $('<button type="button" class="btn btn-default btn-sm"></button>').text(__("Previous"));
  const countLabel = $('<span class="small text-muted" aria-live="polite"></span>').text(__("0 matches"));
  const settingsButton = $('<button type="button" class="btn btn-default btn-sm"></button>').text(__("Settings"));
  settingsButton.on("click", () => frappe.set_route("Form", "DocType Dependency Explorer Settings"));
  controls.append(exploreButton, fitButton, zoomInButton, zoomOutButton, previousButton, findButton, countLabel, settingsButton);
  container.append($('<div class="small" style="margin-top:8px"></div>').text(__("Master: green · Transaction: blue · Child Table: yellow · Click a node to open its DocType; click a connection to inspect its field.")));
  const details = $('<div class="dependency-relationship-details small" role="status" aria-live="polite" style="margin:10px 0;padding:12px;border:1px solid var(--border-color);border-radius:8px"></div>');
  container.append(details);
  details.text(__("Select a connecting line to inspect its relationship."));
  const graphBox = container.find(".dependency-graph")[0];
  const summary = container.find(".dependency-summary");
  const state = { cy: null, loading: false, matches: [], matchIndex: -1, lastQuery: null };
  wrapper._dependencyExplorer = state;

  function parseSettings(defaults = {}) {
    const params = new URLSearchParams(window.location.search);
    doctypeInput.val(params.get("doctype") || "");
    depthInput.val(params.get("depth") || defaults.depth || 1);
    directionInput.val(["both", "incoming", "outgoing"].includes(params.get("direction")) ? params.get("direction") : (defaults.direction || "outgoing"));
    childInput.prop("checked", params.has("include_child_tables") ? params.get("include_child_tables") === "1" : Boolean(defaults.include_child_tables));
    layoutInput.val(["hierarchical", "left-to-right", "radial", "force", "grid"].includes(params.get("layout")) ? params.get("layout") : "hierarchical");
  }
  function zoom(factor) {
    if (!state.cy) return;
    const level = Math.min(3, Math.max(0.15, state.cy.zoom() * factor));
    state.cy.zoom({ level, renderedPosition: { x: graphBox.clientWidth / 2, y: graphBox.clientHeight / 2 } });
  }
  async function explore() {
    if (state.loading) return;
    const values = {
      doctype: String(doctypeInput.val() || "").trim(),
      depth: Number(depthInput.val()),
      direction: directionInput.val(),
      include_child_tables: childInput.is(":checked") ? 1 : 0,
    };
    if (!values.doctype || !Number.isInteger(values.depth) || values.depth < 1 || values.depth > 6) {
      frappe.msgprint(__("Choose a root DocType and a depth between 1 and 6."));
      return;
    }
    state.loading = true;
    exploreButton.prop("disabled", true);
    try {
      await new Promise((resolve, reject) => {
        frappe.require("dependency_explorer.bundle.js", () => {
          if (typeof window.frappeERDependencyRenderGraph !== "function") {
            reject(new Error("Dependency explorer bundle did not initialize"));
          } else resolve();
        });
      });
      const response = await frappe.call({
        method: "frappe_er_generator.frappe_er_generator.dependency_explorer.get_dependency_graph",
        args: values,
        freeze: true,
      });
      if (!response.message) return;
      if (state.cy) state.cy.destroy();
      state.cy = window.frappeERDependencyRenderGraph(graphBox, response.message, (name) => {
        frappe.set_route("Form", "DocType", name);
      }, layoutInput.val(), (edge) => window.frappeERDependencyRelationshipInspector(details, edge));
      window.frappeERDependencyRelationshipInspector(details, null);
      resetSearch();
      state.root = response.message.root;
      summary.text(window.frappeERDependencyGraphSummary(response.message));
      const query = new URLSearchParams({
        doctype: values.doctype,
        depth: String(values.depth),
        direction: values.direction,
        include_child_tables: String(values.include_child_tables),
        layout: layoutInput.val(),
      });
      window.history.replaceState(window.history.state, "", window.location.pathname + "?" + query.toString());
      state.cy.resize();
      state.cy.fit(undefined, 35);
    } catch (error) {
      console.error("Dependency explorer full page:", error);
      frappe.msgprint(__("Unable to load DocType dependencies. Check permissions and server logs."));
    } finally {
      state.loading = false;
      exploreButton.prop("disabled", false);
    }
  }
  function resetSearch() {
    state.matches = [];
    state.matchIndex = -1;
    state.lastQuery = null;
    countLabel.text(__("0 matches"));
    if (state.cy) state.cy.nodes().removeClass("search-match");
  }
  function navigateMatches(step) {
    if (!state.cy) return;
    const query = String(findInput.val() || "").trim().toLocaleLowerCase();
    if (!query) { resetSearch(); return; }
    if (query !== state.lastQuery) {
      state.matches = state.cy.nodes().filter((node) =>
        String(node.data("label") || "").toLocaleLowerCase().includes(query)
      ).sort((a, b) => String(a.data("label")).localeCompare(String(b.data("label")))).toArray();
      state.lastQuery = query;
      state.matchIndex = -1;
      state.cy.nodes().removeClass("search-match");
      state.cy.collection(state.matches).addClass("search-match");
    }
    if (!state.matches.length) {
      countLabel.text(__("0 matches"));
      return;
    }
    state.matchIndex = (state.matchIndex + step + state.matches.length) % state.matches.length;
    const node = state.matches[state.matchIndex];
    state.cy.$(":selected").unselect();
    node.select();
    state.cy.animate({ center: { eles: node }, zoom: Math.min(1.5, Math.max(state.cy.zoom(), 0.8)) }, { duration: 220 });
    countLabel.text((state.matchIndex + 1) + " / " + state.matches.length);
  }
  findButton.text(__("Next")).on("click", () => navigateMatches(1));
  previousButton.on("click", () => navigateMatches(-1));
  findInput.on("input", resetSearch);
  findInput.on("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); navigateMatches(event.shiftKey ? -1 : 1); }
  });
  layoutInput.on("change", () => {
    if (!state.cy || !state.root || typeof window.frappeERDependencyApplyLayout !== "function") return;
    window.frappeERDependencyApplyLayout(state.cy, state.root, layoutInput.val());
    const params = new URLSearchParams(window.location.search);
    params.set("layout", layoutInput.val());
    window.history.replaceState(window.history.state, "", window.location.pathname + "?" + params.toString());
  });
  exploreButton.on("click", explore);
  fitButton.on("click", () => { if (state.cy) { state.cy.resize(); state.cy.fit(undefined, 35); } });
  zoomInButton.on("click", () => zoom(1.2));
  zoomOutButton.on("click", () => zoom(1 / 1.2));
  doctypeInput.on("keydown", (event) => { if (event.key === "Enter") explore(); });
  const onResize = () => { if (state.cy) state.cy.resize(); };
  window.addEventListener("resize", onResize);
  wrapper._dependencyCleanup = () => {
    window.removeEventListener("resize", onResize);
    if (state.cy) state.cy.destroy();
    state.cy = null;
  };
  // Explicit URL settings always override saved site-wide defaults.
  frappe.call({
    method: "frappe_er_generator.frappe_er_generator.dependency_explorer.get_explorer_settings",
  }).then(({ message }) => {
    parseSettings(message || {});
    if (doctypeInput.val()) explore();
  }).catch((error) => {
    console.warn("Explorer settings unavailable:", error);
    parseSettings();
    if (doctypeInput.val()) explore();
  });
};
frappe.pages["doctype-dependency-explorer"].on_page_show = function (wrapper) {
  if (wrapper._dependencyExplorer && wrapper._dependencyExplorer.cy) {
    wrapper._dependencyExplorer.cy.resize();
  }
};
