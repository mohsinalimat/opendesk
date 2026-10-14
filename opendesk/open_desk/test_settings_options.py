# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""Open Desk Settings' Select options and the names the desk is told for them, in step.

The options are typed in the doctype's JSON; the names `js/dock.js` checks are in
`settings.MODULE_PICKERS` and `settings.APP_PICKS`. An option renamed in one and not the
other falls back to the default without an error, so the two are compared here.
"""

import json
from unittest import TestCase

import frappe

from opendesk.open_desk import settings


def _field(fieldname):
	path = frappe.get_app_path(
		"opendesk", "open_desk", "doctype", "open_desk_settings", "open_desk_settings.json"
	)
	with open(path) as f:
		return next(field for field in json.load(f)["fields"] if field["fieldname"] == fieldname)


class TestSettingsOptions(TestCase):
	def check(self, fieldname, names):
		field = _field(fieldname)
		options = field["options"].split("\n")
		self.assertEqual(options, list(names), f"{fieldname}: options and names differ")
		self.assertEqual(len(set(names.values())), len(names), f"{fieldname}: two options share a name")
		# The default option is the first, which is also what an unset value falls back to.
		self.assertEqual(field.get("default"), options[0], f"{fieldname}: the default is not the first")

	def test_module_picker(self):
		self.check(settings.MODULE_PICKER, settings.MODULE_PICKERS)

	def test_app_pick(self):
		self.check(settings.APP_PICK, settings.APP_PICKS)
