# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""The switches for the places this app changes Frappe's desk. Read by
`opendesk.open_desk.settings`, which says what each one turns on."""

from frappe.model.document import Document


class OpenDeskSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		app_pick: DF.Literal["Show Its Modules", "Open Last Module", "Open Last Sidebar Item"]
		enable_apps_screen: DF.Check
		enable_dock: DF.Check
		enable_dock_tools: DF.Check
		enable_user_menu: DF.Check
		module_picker: DF.Literal[
			"Module Menu",
			"App Menu",
			"Sliding Sidebar",
			"Module Tabs",
			"Three Column",
			"Accordion Dock",
			"Accordion Sidebar",
		]
		show_dock_on_mobile: DF.Check
	# end: auto-generated types

	pass
