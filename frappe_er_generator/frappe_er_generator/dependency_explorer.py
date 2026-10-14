"""Bounded, metadata-only DocType dependency traversal for the Desk explorer."""

from collections import deque

import frappe

MAX_DEPTH = 6
MAX_NODES = 250
MAX_EDGES = 1200


def _allowed():
    if "System Manager" not in frappe.get_roles():
        frappe.throw("System Manager role is required to inspect DocType dependencies", frappe.PermissionError)


CACHE_KEY = "frappe_er_generator:doctype_dependency_metadata:v1"


def _settings():
    """Read site-wide settings with conservative fallbacks."""
    defaults = {"direction": "outgoing", "depth": 1, "include_child_tables": 0, "cache_ttl": 300}
    try:
        doc = frappe.get_single("DocType Dependency Explorer Settings")
        direction = str(doc.default_direction or "Outgoing").lower()
        depth = int(doc.default_depth or 1)
        ttl = int(doc.metadata_cache_ttl if doc.metadata_cache_ttl is not None else 300)
        defaults.update({
            "direction": direction if direction in ("incoming", "outgoing", "both") else "outgoing",
            "depth": depth if 1 <= depth <= MAX_DEPTH else 1,
            "include_child_tables": int(bool(doc.default_include_child_tables)),
            "cache_ttl": min(3600, max(0, ttl)),
        })
    except (frappe.DoesNotExistError, ValueError, TypeError, AttributeError):
        pass
    return defaults


@frappe.whitelist()
def get_explorer_settings():
    _allowed()
    values = _settings()
    return {k: values[k] for k in ("direction", "depth", "include_child_tables")}


def invalidate_metadata_cache(doc=None, method=None):
    """Called after DocType, Custom Field, and Property Setter updates."""
    frappe.cache().delete_value(CACHE_KEY)


def _cached_metadata(ttl):
    if ttl:
        stored = frappe.cache().get_value(CACHE_KEY)
        if stored is not None:
            return stored
    metadata = _doctype_metadata()
    if ttl:
        frappe.cache().set_value(CACHE_KEY, metadata, expires_in_sec=ttl)
    return metadata


def _doctype_metadata():
    """Use site metadata to account for installed apps and Custom Fields."""
    names = frappe.get_all("DocType", pluck="name", order_by="name asc")
    graph = {}
    for name in names:
        meta = frappe.get_meta(name)
        graph[name] = {
            "kind": "Child Table" if meta.istable else ("Transaction" if meta.is_submittable else "Master"),
            "module": meta.module,
            "fields": [
                {"fieldname": f.fieldname, "target": f.options, "fieldtype": f.fieldtype}
                for f in meta.fields
                if f.fieldtype in ("Link", "Table", "Table MultiSelect") and f.options
            ],
        }
    return graph


@frappe.whitelist()
def get_dependency_graph(doctype, depth=None, direction=None, include_child_tables=None):
    """Return explicit, directed metadata relationships within N hops.

    A source DocType Link field points to its referenced target.
    A parent Table field points to its child DocType. No records are queried.
    """
    _allowed()
    settings = _settings()
    if depth is None or depth == "":
        depth = settings["depth"]
    if direction is None or direction == "":
        direction = settings["direction"]
    if include_child_tables is None or include_child_tables == "":
        include_child_tables = settings["include_child_tables"]
    if not isinstance(doctype, str) or not frappe.db.exists("DocType", doctype):
        frappe.throw("Select a valid DocType")
    try:
        depth = int(depth)
        include_child_tables = int(include_child_tables)
    except (TypeError, ValueError):
        frappe.throw("Depth and child-table flag must be integers")
    if not 1 <= depth <= MAX_DEPTH:
        frappe.throw("Depth must be between 1 and {}".format(MAX_DEPTH))
    if direction not in ("both", "incoming", "outgoing"):
        frappe.throw("Invalid direction")

    metadata = _doctype_metadata()
    if doctype not in metadata:
        frappe.throw("DocType not found")

    links = []
    adjacency = {name: [] for name in metadata}
    for source, details in metadata.items():
        for field in details["fields"]:
            target = field["target"]
            if target not in metadata:
                continue
            is_child = field["fieldtype"] in ("Table", "Table MultiSelect")
            if is_child and not include_child_tables:
                continue
            if not include_child_tables and (metadata[source]["kind"] == "Child Table" or metadata[target]["kind"] == "Child Table"):
                continue
            edge = {
                "source": source, "target": target,
                "fieldname": field["fieldname"], "fieldtype": field["fieldtype"],
            }
            links.append(edge)
            if direction in ("both", "outgoing"):
                adjacency[source].append(target)
            if direction in ("both", "incoming"):
                adjacency[target].append(source)

    distances = {doctype: 0}
    queue = deque([doctype])
    while queue:
        current = queue.popleft()
        if distances[current] >= depth:
            continue
        for neighbor in adjacency[current]:
            if neighbor in distances:
                continue
            if len(distances) >= MAX_NODES:
                frappe.throw("Graph exceeds {} DocTypes. Reduce depth or use one direction.".format(MAX_NODES))
            distances[neighbor] = distances[current] + 1
            queue.append(neighbor)

    matched = [
        edge for edge in links
        if edge["source"] in distances and edge["target"] in distances
    ]
    if len(matched) > MAX_EDGES:
        frappe.throw("Graph exceeds {} relationships. Reduce depth.".format(MAX_EDGES))
    nodes = [
        {"id": name, "label": name, "kind": metadata[name]["kind"],
         "module": metadata[name]["module"], "level": distance}
        for name, distance in sorted(distances.items(), key=lambda item: (item[1], item[0]))
    ]
    return {
        "root": doctype, "depth": depth, "direction": direction,
        "nodes": nodes, "edges": matched,
        "counts": {
            "doctypes": len(nodes), "relationships": len(matched),
            "masters": sum(n["kind"] == "Master" for n in nodes),
            "transactions": sum(n["kind"] == "Transaction" for n in nodes),
            "child_tables": sum(n["kind"] == "Child Table" for n in nodes),
        },
        "limitations": ["Static Link and Table metadata only; Dynamic Link and document-level references are excluded."],
    }
