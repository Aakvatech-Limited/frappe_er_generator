import frappe
from frappe.model.document import Document


class DocTypeDependencyExplorerSettings(Document):
    def validate(self):
        if self.default_direction not in ("Outgoing", "Incoming", "Both"):
            frappe.throw("Default direction must be Outgoing, Incoming, or Both")
        try:
            depth = int(self.default_depth or 0)
            ttl = int(self.metadata_cache_ttl or 0)
        except (TypeError, ValueError):
            frappe.throw("Depth and cache TTL must be whole numbers")
        if not 1 <= depth <= 6:
            frappe.throw("Default depth must be between 1 and 6")
        if not 0 <= ttl <= 3600:
            frappe.throw("Metadata cache TTL must be between 0 and 3600 seconds")
