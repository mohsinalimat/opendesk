"""This app's switches: one per place it changes how Frappe's desk behaves.

The document is `Open Desk Settings`, a Single. Each switch is opt-in: a site
that never ticked one runs Frappe's own desk. Every one of them leans on details
of Frappe's code that an upgrade can move (`test_frappe_seams.py` lists them),
so each can be switched off without a deploy, the first thing to rule out when
the desk misbehaves after an upgrade.

Reading it is one line and one caveat, so the reader sits beside the document
rather than in each caller.
"""

import frappe

SETTINGS = "Open Desk Settings"

# `js/rail.js`, Frappe's Dock listing the apps `desk_apps` resolves
ENABLE_NAVIGATION_RAIL = "enable_navigation_rail"
# The rail's foot: Search, Notifications and other apps' tiles moved there from the top of the
# sidebar (`js/rail.js`, `scss/rail.scss`). Only with the rail.
ENABLE_RAIL_TOOLS = "enable_rail_tools"
# Where an app's modules are offered: "Module Menu", "App Menu", "Sliding Sidebar", "Module Tabs",
# "Three Column", "Accordion Rail" or "Accordion Sidebar" (`js/rail.js`). Told to the desk as
# `module_picker`: "header", "app_menu", "sidebar", "tabs", "column", "accordion_rail" or
# "accordion_sidebar".
MODULE_PICKER = "module_picker"
# What picking an app on the rail does, in whichever picker: "Open Last Module" goes into it, to
# the module last open in it; "Open Last Sidebar Item" to the sidebar item last open in it; "Show
# Its Modules" offers them over the page you are on (`js/rail.js`). Told to the desk as `app_pick`:
# "enter", "enter_item" or "offer".
APP_PICK = "app_pick"
# `apps_screen.py`, which arranges Frappe's Apps screen from the Desk Apps
ENABLE_APPS_SCREEN = "enable_apps_screen"
# `js/user_menu.js`, which moves the site tools and Help into the desk's user menu
ENABLE_USER_MENU = "enable_user_menu"

# What the desk is told, under `frappe.boot.opendesk_features`: each key is the
# name the browser half checks, and each value the field that switches it.
DESK_FEATURES = {
	"navigation_rail": ENABLE_NAVIGATION_RAIL,
	"rail_tools": ENABLE_RAIL_TOOLS,
	"apps_screen": ENABLE_APPS_SCREEN,
	"user_menu": ENABLE_USER_MENU,
}


def _settings():
	"""The cached settings document, or None between this app landing and its migrate.

	Asked on every desk boot, so the missing-doctype case is the exception path
	rather than an existence query up front. Frappe raises
	`ImportError` for a Single whose doctype isn't there; the same error from a
	doctype that *is* there is a real fault, and is raised.
	"""
	try:
		return frappe.get_cached_doc(SETTINGS)
	except (ImportError, frappe.DoesNotExistError):
		if frappe.db.exists("DocType", SETTINGS):
			raise
		return None


def feature_enabled(fieldname: str) -> bool:
	"""Whether a site has switched on the feature behind an `ENABLE_*` field.

	Off until somebody says otherwise: a Check with no row in `tabSingles` reads
	as 0, and so does a site with no doctype yet. Read through the document cache;
	a save clears the cached copy.
	"""
	doc = _settings()
	return bool(doc and doc.get(fieldname))


def may_configure() -> bool:
	"""Whether this user gets Open Desk's tile: someone who may edit its settings or its Desk Apps.

	Frappe's `add_to_apps_screen` `has_permission`; the module itself is offered by Frappe's
	own permission on the doctypes in it.
	"""
	return frappe.has_permission(SETTINGS, "write") or frappe.has_permission("Desk App", "write")


def extend_bootinfo(bootinfo: "frappe._dict") -> None:
	"""Tell the desk which of its patches to install.

	Read once, when the scripts load, so a change reaches a user on their next reload. The
	Apps screen counts as on only where the site's desktop is the Apps screen
	(`apps_screen.enabled`). If the switches cannot be read, the desk is told none is on, and
	its scripts install nothing: the boot is every page load, and must not fail with them.
	"""
	from opendesk.open_desk import apps_screen

	try:
		features = {key: feature_enabled(field) for key, field in DESK_FEATURES.items()}
		features["apps_screen"] = apps_screen.enabled()
		features["module_picker"] = module_picker()
		features["app_pick"] = app_pick()
	except Exception:
		log_boot_failure("Open Desk settings: kept Frappe's desk")
		features = {}
	bootinfo.opendesk_features = features


# How long a boot hook's failure is logged once for, rather than on every page load.
BOOT_FAILURE_QUIET = 60 * 60


def log_boot_failure(title: str) -> None:
	"""Log the exception being handled, once an hour per site and `title`.

	The boot hooks run on every desk load for every user, so a fault in one would otherwise
	write an Error Log per page shown. Called from the `except` that caught it.
	"""
	if _first_this_hour(f"opendesk_boot_failure:{title}"):
		frappe.log_error(title=title, defer_insert=True)


def _first_this_hour(key: str) -> bool:
	"""Whether nothing has been logged under `key` in the last `BOOT_FAILURE_QUIET` seconds."""
	try:
		if frappe.cache.get_value(key):
			return False
		frappe.cache.set_value(key, 1, expires_in_sec=BOOT_FAILURE_QUIET)
	except Exception:
		# No cache to ask: logged every time, which is still better than not at all.
		pass
	return True


@frappe.whitelist(methods=["POST"])
def report_rail_failure(error: str, route: str | None = None) -> None:
	"""Log that the rail met a change in Frappe in someone's browser and switched itself off.

	The desk's half gives up quietly (`give_up` in `js/rail.js`): the person sees Frappe's own desk
	and the reason is only in their console. This puts it in the Error Log, where an upgrade that
	moved something is noticed -- once an hour per site, however many desks meet it.
	"""
	if _first_this_hour("opendesk_rail_failure"):
		frappe.log_error(
			title="Open Desk rail: switched off in the browser",
			message=f"User: {frappe.session.user}\nRoute: {route or ''}\n\n{(error or '')[:4000]}",
			defer_insert=True,
		)


# Each Select option, by the name the desk is told (`js/rail.js` checks these names). A value the
# site has not set, or one not here, is the default: the first of each.
MODULE_PICKERS = {
	"Module Menu": "header",
	"App Menu": "app_menu",
	"Sliding Sidebar": "sidebar",
	"Module Tabs": "tabs",
	"Three Column": "column",
	"Accordion Rail": "accordion_rail",
	"Accordion Sidebar": "accordion_sidebar",
}
APP_PICKS = {
	"Open Last Module": "enter",
	"Open Last Sidebar Item": "enter_item",
	"Show Its Modules": "offer",
}


def module_picker() -> str:
	"""Where an app's modules are offered (`MODULE_PICKERS`); "header", the Module Menu, by default."""
	return _choice(MODULE_PICKER, MODULE_PICKERS)


def app_pick() -> str:
	"""What picking an app does (`APP_PICKS`); "enter", at its last module, by default."""
	return _choice(APP_PICK, APP_PICKS)


def _choice(fieldname: str, names: dict) -> str:
	doc = _settings()
	choice = doc.get(fieldname) if doc else None
	return names.get(choice) or next(iter(names.values()))
