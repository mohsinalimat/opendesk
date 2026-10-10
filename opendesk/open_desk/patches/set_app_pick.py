"""Open Desk Settings' Picking an App arrived after each Module Picker had its own way: Module Tabs
and the two accordions went into the app, the rest showed its modules. Keep each site's as it was."""

import frappe

ENTERED = {"Module Tabs", "Accordion Rail", "Accordion Sidebar"}


def execute():
	picker = frappe.db.get_single_value("Open Desk Settings", "module_picker")
	frappe.db.set_single_value(
		"Open Desk Settings",
		"app_pick",
		"Open Last Module" if picker in ENTERED else "Show Its Modules",
	)
