"""Open Desk Settings' Module Picker option Dropdown Menu was renamed Module Menu."""

import frappe


def execute():
	if frappe.db.get_single_value("Open Desk Settings", "module_picker") == "Dropdown Menu":
		frappe.db.set_single_value("Open Desk Settings", "module_picker", "Module Menu")
