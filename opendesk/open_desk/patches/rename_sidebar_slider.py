"""Open Desk Settings' Module Picker option Sidebar Slider was renamed Sliding Sidebar."""

import frappe


def execute():
	if frappe.db.get_single_value("Open Desk Settings", "module_picker") == "Sidebar Slider":
		frappe.db.set_single_value("Open Desk Settings", "module_picker", "Sliding Sidebar")
