app_name = "opendesk"
app_title = "Open Desk"
app_publisher = "Peter"
app_description = "An app dock and other desk navigation extensions for Frappe"
app_email = "peter@theopen.institute"
app_license = "MIT"

# On Frappe's Apps screen and in its Apps switcher, for those who may configure it. Declaring this
# is also what makes Frappe -- and the dock, which follows Frappe's rule -- list Open Desk as an
# app of its own rather than leave its module under Other (`desk_apps.listed_apps`).
add_to_apps_screen = [
	{
		"name": "opendesk",
		"logo": "/assets/opendesk/images/opendesk-logo.svg",
		"title": "Open Desk",
		"route": "/desk/open-desk-settings",
		"has_permission": "opendesk.open_desk.settings.may_configure",
	}
]
# Its mark is the `logo` above, which the dock and the Apps screen both read. Not also the
# `app_logo_url` hook: Frappe falls back to that hook for the *site's* logo when exactly two
# apps declare one (`navbar_settings.get_app_logo`), so on a site of Frappe and Open Desk alone
# this app's mark would become the site's.

# The module's dual-tone icon (`open-desk-duotone`), drawn by the Dock and the sidebar header.
# The Dock and the Sidebar themselves are documents this app ships: `opendesk/dock/opendesk/`
# and `opendesk/open_desk/sidebar/open_desk/`, synced on migrate.
app_include_icons = ["/assets/opendesk/icons/module-icons.svg"]

# Apps
# ------------------

# Nothing but Frappe. Every feature here changes Frappe's own desk, and each is
# off until Open Desk Settings switches it on. Other apps add to the dock through
# `opendesk.dock.tools` (`open_desk/js/dock.js`) and need nothing from this app
# when it is not installed.
required_apps = []

# Includes in <head>
# ------------------

# One bundle, loaded after core's own `app_include_js`, so the classes it patches
# already exist. `opendesk/public/js/opendesk.bundle.js` lists what is in it.
app_include_js = "opendesk.bundle.js"
app_include_css = "opendesk.bundle.css"

# Document Events
# ---------------

doc_events = {
	# The dock's site-level inputs are cached; these are what it reads.
	# See `opendesk.open_desk.desk_apps._site_inputs`.
	**{
		doctype: {
			"on_update": "opendesk.open_desk.desk_apps.clear_cache",
			"after_delete": "opendesk.open_desk.desk_apps.clear_cache",
		}
		for doctype in ("Desk App", "Module Def", "Dock")
	},
}

# Uninstalling another app: a Desk App in Replace mode that loses every module row it had goes
# back to Add (`doctype/desk_app/desk_app.py`).
before_app_uninstall = ["opendesk.open_desk.doctype.desk_app.desk_app.before_app_uninstall"]
after_app_uninstall = ["opendesk.open_desk.doctype.desk_app.desk_app.after_app_uninstall"]

# Boot
# ----

extend_bootinfo = [
	# The dock's apps, when Open Desk Settings switches it on.
	"opendesk.open_desk.desk_apps.extend_bootinfo",
	# Frappe's Apps screen arranged from the same apps, when Open Desk Settings says so.
	# After the dock's, whose answer it reuses.
	"opendesk.open_desk.apps_screen.extend_bootinfo",
	# Which of the desk patches Open Desk Settings switches on.
	"opendesk.open_desk.settings.extend_bootinfo",
]

# Automatically update python controller files with type annotations for this app.
export_python_type_annotations = True

# Require all whitelisted methods to have type annotations
require_type_annotated_api_methods = True
