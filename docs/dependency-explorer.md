# DocType Dependency Explorer (Frappe Desk)

Optional interactive graph mode backed by Cytoscape.js. The existing Graphviz `get_erd` API remains untouched.

## Installation / build

Run `yarn install` in this app and `bench build --app frappe_er_generator`; then clear the site's cache. The JS bundle is included globally only within Frappe Desk.

## Usage

Navigate to any standard DocType Form or List view and press **Alt+Shift+/**. Select the root DocType, depth (1–6), direction, and whether to include child tables. Click **Explore**. Click a node to open the DocType definition.

* Blue: Transaction (`issubmittable=1`)
* Green: Master (`issubmittable=0`)
* Gold: Child Table (`istable=1`), when included

All nodes display **names only**. The graph is metadata-only; this is **not** a record count. The backend follows static Link fields and optional Table / Table MultiSelect fields, including Custom Fields. Dynamic Link, fetch_from, dashboard links and implicit transaction relationships are out of scope for this initial PR.

## Security and limits

The endpoint is restricted to users with the **System Manager** role. Depth is limited to six; expansion is capped at 250 DocTypes and 1,200 edges. The original `get_erd` remains available.

## Testing

Validate on a Frappe v16 site with `bench build --app frappe_er_generator`, `bench --site <site> migrate`, and a hard refresh. Test a self-referencing DocType, incoming links, outgoing links, child table inclusion and non-System-Manager access. Also verify shortcut behavior across your browser and keyboard layout.
