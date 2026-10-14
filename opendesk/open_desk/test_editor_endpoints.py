# Copyright (c) 2026, Peter and contributors
# For license information, please see license.txt

"""The editors' endpoints (`arrange.py`) and the Desk App record's own checks, on a real site.

The rest of the tests run over plain data. These need a site with Open Desk installed,
named in `OPENDESK_TEST_SITE`, and are skipped without one:

    cd sites && OPENDESK_TEST_SITE=demo.localhost ../env/bin/python -m unittest \\
        opendesk.open_desk.test_editor_endpoints

They save Desk App records through the endpoints and read the dock back, each test in a
transaction that is rolled back at its end -- nothing here commits -- and each checks that
the site's records are what they were. No module is made: the editor's New Module would
make a Module Def and a workspace, which a site in developer mode writes out as files.
"""

import json
import os
from unittest import TestCase, skipUnless

import frappe

SITE = os.environ.get("OPENDESK_TEST_SITE")
TITLE = "Open Desk Test App"


@skipUnless(SITE, "set OPENDESK_TEST_SITE to a site with Open Desk to run these")
class TestEditorEndpoints(TestCase):
	@classmethod
	def setUpClass(cls):
		frappe.init(SITE, sites_path=os.getcwd())
		frappe.connect()

	@classmethod
	def tearDownClass(cls):
		frappe.destroy()

	def setUp(self):
		from opendesk.open_desk import arrange
		from opendesk.open_desk import desk_apps as nav

		self.arrange, self.nav = arrange, nav
		frappe.set_user("Administrator")
		self.records = set(frappe.get_all(nav.APP, pluck="name"))

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()
		self.nav.clear_cache()
		self.assertEqual(
			set(frappe.get_all(self.nav.APP, pluck="name")),
			self.records,
			"the rollback left the site's Desk Apps changed",
		)

	# --------------------------------------------------------------------------- helpers

	def dock(self):
		return self.arrange._dock()

	def items(self, dock, hidden=(), shown=()):
		"""The dock as Manage Desk Apps sends it back, with `hidden` taken off and `shown` put on."""
		return [
			{
				"key": app["key"],
				"hidden": (bool(app.get("hidden")) or app["key"] in hidden) and app["key"] not in shown,
				"apps_screen": app.get("apps_screen") or "Default",
			}
			for app in dock
		]

	def visible(self, dock):
		return [app["key"] for app in dock if not app.get("hidden")]

	def installed(self, dock, modules=1):
		"""An installed app on the dock as it comes, with no record and at least `modules` modules."""
		app = next(
			(
				app
				for app in dock
				if app.get("installed_app") not in (None, self.nav.OTHER)
				and not app.get("record")
				and not app.get("hidden")
				and len([m for m in app.get("modules") or [] if m.get("shell")]) >= modules
			),
			None,
		)
		if not app:
			self.skipTest(f"no installed app with {modules} modules and no record on {SITE}")
		return app

	def created(self):
		return set(frappe.get_all(self.nav.APP, pluck="name")) - self.records

	# ----------------------------------------------------------------------------- tests

	def test_refuses_without_the_rights(self):
		frappe.set_user("Guest")
		with self.assertRaises(frappe.PermissionError):
			self.arrange.get_dock()
		with self.assertRaises(frappe.PermissionError):
			self.arrange.save_dock("[]")
		with self.assertRaises(frappe.PermissionError):
			self.arrange.save_app_modules("app:frappe", "[]")

	def test_hiding_an_app_makes_a_record_and_showing_it_removes_it(self):
		app = self.installed(self.dock())
		self.arrange.save_dock(json.dumps(self.items(self.dock(), hidden={app["key"]})))
		hidden = next(a for a in self.dock() if a["key"] == app["key"])
		self.assertTrue(hidden.get("hidden"))
		self.assertTrue(hidden.get("record"))

		self.arrange.save_dock(json.dumps(self.items(self.dock(), shown={app["key"]})))
		self.assertFalse(frappe.db.exists(self.nav.APP, hidden["record"]), "the placeholder was kept")
		self.assertFalse(self.created())

	def test_a_save_over_a_newer_one_is_refused(self):
		opened = self.arrange.get_dock()
		self.assertEqual([a["key"] for a in opened["apps"]], [a["key"] for a in self.dock()])
		app = self.installed(self.dock())
		saved = self.arrange.save_dock(
			json.dumps(self.items(self.dock(), hidden={app["key"]})), stamp=opened["stamp"]
		)
		self.assertNotEqual(saved["stamp"], opened["stamp"], "the save left the stamp as it was")
		self.assertEqual(saved["stamp"], self.arrange.records_stamp())

		# A second editor, opened before that save: refused, for Manage Modules as for the dock.
		with self.assertRaises(frappe.TimestampMismatchError):
			self.arrange.save_dock(json.dumps(self.items(self.dock())), stamp=opened["stamp"])
		with self.assertRaises(frappe.TimestampMismatchError):
			self.arrange.save_app_modules(app["key"], "[]", stamp=opened["stamp"])

		# The stamp the save handed back is current: the editor still open may save over it.
		self.arrange.save_dock(json.dumps(self.items(self.dock(), shown={app["key"]})), stamp=saved["stamp"])

	def test_an_uninstall_that_empties_a_replace_record_turns_it_to_add(self):
		from unittest.mock import patch

		from opendesk.open_desk.doctype.desk_app import desk_app

		taken = set(
			frappe.get_all(
				self.nav.APP_MODULE,
				filters={"parenttype": self.nav.APP},
				pluck="module",
				parent_doctype=self.nav.APP,
			)
		)
		module = next((m for m in frappe.get_all("Module Def", pluck="name") if m not in taken), None)
		if not module:
			self.skipTest(f"every module on {SITE} is listed by a Desk App")

		def record(title, modules):
			return frappe.get_doc(
				{
					"doctype": self.nav.APP,
					"title": title,
					"enabled": 0,
					"module_mode": self.nav.REPLACE,
					"modules": [{"type": self.nav.MODULE, "module": m} for m in modules],
				}
			).insert()

		emptied = record(TITLE, [module])
		chosen = record(f"{TITLE} 2", [])

		desk_app.before_app_uninstall("some_app")
		# What Frappe's uninstall does to a row linking to one of the app's modules.
		frappe.delete_doc(self.nav.APP_MODULE, emptied.modules[0].name, ignore_on_trash=True, force=True)
		with patch.object(desk_app.frappe.db, "commit") as commit:
			desk_app.after_app_uninstall("some_app")
		commit.assert_called_once()

		self.assertEqual(frappe.db.get_value(self.nav.APP, emptied.name, "module_mode"), self.nav.ADD)
		# One that listed nothing before was left that way on purpose.
		self.assertEqual(frappe.db.get_value(self.nav.APP, chosen.name, "module_mode"), self.nav.REPLACE)

	def test_moving_one_app_anchors_only_it(self):
		dock = self.dock()
		movable = [k for k in self.visible(dock) if k != f"app:{self.nav.OTHER}"]
		if len(movable) < 2:
			self.skipTest("too few apps on the dock")
		moved = movable[-1]
		wanted = [moved, *[k for k in self.visible(dock) if k != moved]]
		order = {key: i for i, key in enumerate(wanted)}
		items = sorted(self.items(dock), key=lambda item: order.get(item["key"], len(order)))
		self.arrange.save_dock(json.dumps(items))
		self.assertEqual(self.visible(self.dock()), wanted)
		self.assertEqual(len(self.created()), 1, "more than the moved app got a record")

	def test_items_without_a_key_or_twice_are_ignored(self):
		dock = self.dock()
		items = self.items(dock)
		self.arrange.save_dock(json.dumps([{"hidden": 1}, *items, dict(items[0])]))
		self.assertEqual(self.visible(self.dock()), self.visible(dock))
		self.assertFalse(self.created())

	def test_a_hidden_unlisted_app_gets_no_modules(self):
		app = next((a for a in self.dock() if a.get("unlisted") and a.get("hidden")), None)
		if not app:
			self.skipTest(f"no hidden unlisted app on {SITE}")
		with self.assertRaises(frappe.ValidationError):
			self.arrange.save_app_modules(app["key"], "[]")
		self.assertFalse(self.created())

	def test_taking_a_module_off_sends_it_to_other(self):
		from frappe.boot import get_module_sidebars

		app = self.installed(self.dock(), modules=2)
		rows = self.arrange.get_app_modules(app["key"])["rows"]
		listed = [r for r in rows if r["kind"] == "module" and not r.get("hidden")]
		off = listed[-1]["module"]
		items = [dict(r, hidden=True) if r.get("module") == off else r for r in rows]
		self.arrange.save_app_modules(app["key"], json.dumps(items))

		dock = {a["key"]: a for a in self.dock()}
		record = dock[app["key"]]["record"]
		self.assertEqual(frappe.db.get_value(self.nav.APP, record, "module_mode"), self.nav.REPLACE)
		sidebars = get_module_sidebars()

		def module_of(entry):
			return (sidebars.get(entry["shell"]) or {}).get("module") or entry["shell"]

		self.assertNotIn(off, [module_of(e) for e in dock[app["key"]]["modules"] if e.get("shell")])
		other = next(a for a in dock.values() if a.get("installed_app") == self.nav.OTHER)
		self.assertIn(off, [module_of(e) for e in other["modules"] if e.get("shell")])

	def test_a_new_app_takes_its_drafted_modules(self):
		donor = self.installed(self.dock(), modules=2)
		module = [
			r["module"]
			for r in self.arrange.get_app_modules(donor["key"])["rows"]
			if r["kind"] == "module" and not r.get("hidden")
		][-1]
		new = {
			"key": "new:0",
			"new": True,
			"title": TITLE,
			"modules": json.dumps([{"kind": "module", "module": module}]),
		}
		result = self.arrange.save_dock(json.dumps([new, *self.items(self.dock())]))

		key = f"desk-app:{TITLE}"
		self.assertEqual(result["created"], [key])
		dock = self.dock()
		self.assertEqual(self.visible(dock)[0], key, "the new app is not where the editor put it")
		doc = frappe.get_doc(self.nav.APP, TITLE)
		self.assertEqual([row.module for row in doc.modules], [module])
		# And it left the app it came from.
		donor_rows = self.arrange.get_app_modules(donor["key"])["rows"]
		self.assertNotIn(module, [r.get("module") for r in donor_rows if not r.get("hidden")])

	def test_a_desk_app_refuses_what_would_run_as_code(self):
		def app(**values):
			return frappe.get_doc({"doctype": self.nav.APP, "title": TITLE, "enabled": 1, **values})

		with self.assertRaises(frappe.ValidationError):
			app(frontend_url="javascript:alert(1)").insert()
		with self.assertRaises(frappe.ValidationError):
			app(frontend_url="//elsewhere.example").insert()
		with self.assertRaises(frappe.ValidationError):
			app(icon='x" onload="alert(1)').insert()
		with self.assertRaises(frappe.ValidationError):
			app(installed_app="not_an_installed_app").insert()
		# What it accepts.
		app(frontend_url="/app/todo", icon="box").insert()
		self.assertEqual(self.created(), {TITLE})
