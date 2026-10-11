"""Open Desk Settings' Module Picker options were renamed: carry a site's choice over to its name
now. Every earlier name maps straight to the current one, so this is a no-op once run, and on a
site whose choice already has its current name."""

import frappe

RENAMED = {
	"Header Menu": "Module Menu",
	"Dropdown Menu": "Module Menu",
	"Sidebar List": "Sliding Sidebar",
	"Sidebar Slider": "Sliding Sidebar",
	"Module Column": "Three Column",
}


def execute():
	choice = frappe.db.get_single_value("Open Desk Settings", "module_picker")
	if choice in RENAMED:
		frappe.db.set_single_value("Open Desk Settings", "module_picker", RENAMED[choice])
