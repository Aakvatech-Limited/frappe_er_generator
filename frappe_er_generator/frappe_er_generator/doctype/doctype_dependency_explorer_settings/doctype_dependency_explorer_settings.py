from frappe.model.document import Document


class DocTypeDependencyExplorerSettings(Document):
    def validate(self):
        if self.default_direction not in ("Outgoing", "Incoming", "Both"):
            raise ValueError("Default direction must be Outgoing, Incoming, or Both")
        if not 1 <= int(self.default_depth or 0) <= 6:
            raise ValueError("Default depth must be between 1 and 6")
        if not 0 <= int(self.metadata_cache_ttl or 0) <= 3600:
            raise ValueError("Metadata cache TTL must be between 0 and 3600 seconds")
