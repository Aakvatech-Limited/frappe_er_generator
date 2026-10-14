/* Unbundled Desk shortcut launcher; Cytoscape loads on first use. */
(function () {
  "use strict";
  if (window.frappeERDependencyLauncherInstalled) return;
  window.frappeERDependencyLauncherInstalled = true;

  function doctype() {
    if (!window.frappe || !frappe.get_route) return null;
    const route = frappe.get_route();
    return route && (route[0] === "Form" || route[0] === "List") ? route[1] : null;
  }

  function launch() {
    if (!doctype()) {
      frappe.show_alert({ message: __("Open a DocType Form or List first"), indicator: "orange" });
      return;
    }
    if (typeof window.frappeERDependencyOpen === "function") {
      window.frappeERDependencyOpen();
      return;
    }
    frappe.require("dependency_explorer.bundle.js", function () {
      if (typeof window.frappeERDependencyOpen === "function") {
        window.frappeERDependencyOpen();
      } else {
        frappe.msgprint(__("Dependency Explorer JavaScript did not load. Build assets and clear cache."));
      }
    });
  }

  window.frappeERDependencyLaunch = launch;

  document.addEventListener("keydown", function (event) {
    if (!(event.altKey && event.shiftKey && (event.code === "Slash" || event.key === "/"))) return;
    if (event.ctrlKey || event.metaKey || event.repeat || !doctype()) return;
    const target = event.target;
    if (target && (target.matches("input, textarea, select") || target.closest('[contenteditable="true"], .modal'))) return;
    event.preventDefault();
    event.stopPropagation();
    launch();
  }, true);

  function registerMenu() {
    if (!doctype() || !window.cur_frm || !cur_frm.page || !cur_frm.page.add_menu_item) return;
    if (cur_frm.__dependencyExplorerMenuAdded) return;
    cur_frm.__dependencyExplorerMenuAdded = true;
    cur_frm.page.add_menu_item(__("DocType Dependency Explorer"), launch);
  }
  $(document).on("page-change", function () { setTimeout(registerMenu, 300); });
  if (window.frappe && frappe.router && typeof frappe.router.on === "function") {
    frappe.router.on("change", function () { setTimeout(registerMenu, 300); });
  }
  setTimeout(registerMenu, 600);
})();
