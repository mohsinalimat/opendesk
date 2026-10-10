"""Open Desk Settings' Module Picker options were renamed: Header Menu is now Dropdown Menu, Sidebar
List is Sidebar Slider and Module Column is Three Column. Carry a site's choice over to its new name."""

import frappe

RENAMED = {
	"Header Menu": "Dropdown Menu",
	"Sidebar List": "Sidebar Slider",
	"Module Column": "Three Column",
}


def execute():
	choice = frappe.db.get_single_value("Open Desk Settings", "module_picker")
	if choice in RENAMED:
		frappe.db.set_single_value("Open Desk Settings", "module_picker", RENAMED[choice])
