// A browser smoke test for Open Desk: the rail, its module picker and tools, the user menu, Manage
// Desk Apps and Manage Modules, and the Apps screen, on a running site, as one user. The module picker
// is checked in whichever form Open Desk Settings' Module Picker gives it: Module Menu,
// Sliding Sidebar, Three Column, Module Tabs, Accordion Rail or Accordion Sidebar.
//
// It only reads. Every editor it opens is closed without saving, and it changes no setting: what it
// checks is whatever the site has switched on (Open Desk Settings), and a feature switched off is
// reported as skipped. Run it through `run.sh`, which provides Playwright; see its header.
//
// `test_frappe_seams.py` checks that the names Open Desk hangs on are still in Frappe's source.
// This checks that they still behave: that the rail draws, opens and navigates, and that nothing
// throws on the way.
"use strict";

const { chromium } = require("playwright");

const BASE = (process.argv[2] || process.env.OPENDESK_SMOKE_URL || "").replace(
  /\/$/,
  ""
);
const USER = process.env.OPENDESK_SMOKE_USER || "Administrator";
const PASSWORD = process.env.OPENDESK_SMOKE_PASSWORD;
// Or an existing session's cookie, for a site whose password you would rather not type. The run
// logs out at the end, which ends that session too.
const SID = process.env.OPENDESK_SMOKE_SID;
const HEADED = process.env.OPENDESK_SMOKE_HEADED === "1";
// A module picker to check in place of the site's -- app_menu, header, sidebar, column, tabs,
// accordion_rail or accordion_sidebar -- written into the desk's boot as each page loads, so the
// setting itself is never changed.
const PICKER = process.env.OPENDESK_SMOKE_PICKER;
// And what picking an app does, "enter", "enter_item" or "offer", the same way.
const APP_PICK = process.env.OPENDESK_SMOKE_APP_PICK;

if (!BASE || !(PASSWORD || SID)) {
  console.error(
    "usage: OPENDESK_SMOKE_PASSWORD=... (or OPENDESK_SMOKE_SID=...) [OPENDESK_SMOKE_USER=...] run.sh http://site.localhost:8000"
  );
  process.exit(2);
}

const MENU_ROWS = '[role="menu"] [role="menuitem"]';
const results = [];
const pass = (name, detail = "") =>
  results.push({ status: "pass", name, detail });
const fail = (name, detail = "") =>
  results.push({ status: "fail", name, detail });
const skip = (name, detail = "") =>
  results.push({ status: "skip", name, detail });

async function check(name, fn) {
  try {
    const detail = await fn();
    if (detail && detail.skip) skip(name, detail.skip);
    else pass(name, typeof detail === "string" ? detail : "");
  } catch (e) {
    fail(name, (e && e.message ? e.message : String(e)).split("\n")[0]);
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function settle(page, ms = 1500) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(ms);
}

async function close_dialogs(page) {
  for (let i = 0; i < 3 && (await page.locator(".modal.show").count()); i++) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  }
}

// The sidebar header, when its menu would hold a single row (Edit Sidebar beside the module
// column), is a plain button that runs that row and names it in its tooltip. Its rows are read
// from there rather than by clicking it, which would open the row's editor.
async function header_rows(page) {
  // A header drawn as a label (Sliding Sidebar), or not drawn (Module Tabs), has no menu.
  const none = await page.evaluate(() => {
    const header = document.querySelector(".body-sidebar .sidebar-header");
    return (
      !header ||
      header.classList.contains("opendesk-header-plain") ||
      header.classList.contains("opendesk-header-hidden")
    );
  });
  if (none) return [];
  const lone = await page.evaluate(() => {
    const header = document.querySelector(".body-sidebar .sidebar-header");
    const chevron = header && header.querySelector(".drop-icon");
    return (
      !!chevron &&
      chevron.classList.contains("hidden") &&
      header.getAttribute("title")
    );
  });
  if (lone) return [lone];
  await page.locator(".body-sidebar .sidebar-header").first().click();
  await page.waitForTimeout(500);
  const rows = await page.$$eval(MENU_ROWS, (els) =>
    els.map((el) => el.textContent.trim())
  );
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  return rows;
}

// Whether the module column is on screen (not below 768px, where the header menu picks).
const column_on = (page) =>
  page.evaluate(() => document.body.classList.contains("opendesk-column-on"));

// Whether the band of module tabs is on screen (not below 768px, where the header menu picks).
const tabs_on = (page) =>
  page.evaluate(() => document.body.classList.contains("opendesk-tabs-on"));

// Whether the open app's modules are listed somewhere of their own (the column, the band, the
// rail or the sidebar) rather than in the header menu.
const beside_on = (page) =>
  page.evaluate(() =>
    document.body.classList.contains("opendesk-modules-beside")
  );

// The pickers by the names Open Desk Settings gives them.
const PICKER_NAMES = {
  app_menu: "App Menu",
  header: "Module Menu",
  sidebar: "Sliding Sidebar",
  column: "Three Column",
  tabs: "Module Tabs",
  accordion_rail: "Accordion Rail",
  accordion_sidebar: "Accordion Sidebar",
};

// Whether the module on screen is one of `title`'s.
const inside_app = (page, title) =>
  page.evaluate(
    (title) =>
      frappe.boot.desk_apps
        .find((a) => a.title === title)
        .modules.some((m) => m.shell === frappe.app.sidebar.current_module),
    title
  );

// Picks the app called `title` on the rail: its tile, or with App Menu, its row in the menu the
// rail's mark opens.
async function pick_app(page, title) {
  const in_menu = await page.evaluate(
    () => frappe.boot.opendesk_features.module_picker === "app_menu"
  );
  if (!in_menu) {
    await page
      .locator(`.dock .opendesk-rail-app[aria-label="${title}"]`)
      .click();
    return;
  }
  await page.locator(".dock .dock-logo .shell-header").click();
  await page.waitForSelector(MENU_ROWS, { timeout: 5000 });
  await page.getByRole("menuitem", { name: title, exact: true }).click();
}

// Picks another app with modules on the rail, then `title` again: the module it came back to,
// which should be the one it was left in.
async function round_trip(page, title) {
  const other = await page.evaluate(
    (title) =>
      (frappe.boot.desk_apps || []).find(
        (a) =>
          a.title !== title &&
          (a.modules || []).some((m) => frappe.boot.module_sidebars[m.shell])
      )?.title,
    title
  );
  if (!other) return null;
  await pick_app(page, other);
  await settle(page);
  const went = await page.evaluate(
    (other) =>
      frappe.boot.desk_apps
        .find((a) => a.title === other)
        .modules.some((m) => m.shell === frappe.app.sidebar.current_module),
    other
  );
  assert(went, `picking ${other} did not go into it`);
  await pick_app(page, title);
  await settle(page);
  return {
    other,
    back: await page.evaluate(() => frappe.app.sidebar.current_module),
    path: await page.evaluate(() => window.location.pathname),
  };
}

// The app the band of module tabs names.
const tabs_title = (page) =>
  page.evaluate(() =>
    document.querySelector(".opendesk-tabs-title").textContent.trim()
  );

// An app with something to choose -- more than one module -- and its last module's label.
// Not the app the page is in, which a pick offers rather than goes into.
const app_with_choice = (page) =>
  page.evaluate(() => {
    const current = frappe.app.sidebar && frappe.app.sidebar.current_module;
    const app = (frappe.boot.desk_apps || []).find(
      (a) =>
        (a.modules || []).filter((m) => frappe.boot.module_sidebars[m.shell])
          .length > 1 && !(a.modules || []).some((m) => m.shell === current)
    );
    if (!app) return null;
    const modules = app.modules.filter(
      (m) => frappe.boot.module_sidebars[m.shell]
    );
    return { title: app.title, last: __(modules[modules.length - 1].label) };
  });

(async () => {
  const browser = await chromium.launch({
    channel: "chrome",
    headless: !HEADED,
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
  });
  const page = await context.newPage();
  if (PICKER || APP_PICK) {
    await page.route(/\/(desk|app)(\/|$|\?)/, async (route) => {
      if (route.request().resourceType() !== "document")
        return route.fallback();
      const response = await route.fetch();
      let body = await response.text();
      if (PICKER)
        body = body.replace(
          /"module_picker":\s*"[a-z_]+"/,
          `"module_picker": "${PICKER}"`
        );
      if (APP_PICK)
        body = body.replace(
          /"app_pick":\s*"[a-z_]+"/,
          `"app_pick": "${APP_PICK}"`
        );
      await route.fulfill({ response, body });
    });
  }
  const page_errors = [];
  const console_errors = [];
  page.on("pageerror", (e) => page_errors.push(e.message.split("\n")[0]));
  page.on("console", (m) => {
    if (m.type() === "error")
      console_errors.push(m.text().split("\n")[0].slice(0, 160));
  });

  let features = {};
  try {
    await check("logs in", async () => {
      if (SID) {
        await context.addCookies([{ name: "sid", value: SID, url: BASE }]);
        return "with the session given";
      }
      const response = await context.request.post(`${BASE}/api/method/login`, {
        form: { usr: USER, pwd: PASSWORD },
      });
      assert(response.ok(), `login answered ${response.status()}`);
      return USER;
    });

    await check("desk boots with Open Desk", async () => {
      await page.goto(`${BASE}/desk/user`);
      await settle(page, 2500);
      features = await page.evaluate(
        () => (window.frappe && frappe.boot.opendesk_features) || null
      );
      assert(
        features,
        "no frappe.boot.opendesk_features: is Open Desk installed and built?"
      );
      return (
        Object.entries(features)
          // Switches are on or off; the module picker names its form.
          .map(([key, value]) =>
            typeof value === "string"
              ? `${key} ${value}`
              : `${key} ${value ? "on" : "off"}`
          )
          .join(", ")
      );
    });

    // ---------------------------------------------------------------------------------- rail
    await check("rail draws the apps", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      const state = await page.evaluate(() => ({
        on: document.body.classList.contains("opendesk-rail-on"),
        tiles: document.querySelectorAll(".dock .opendesk-rail-app").length,
        modules: document.querySelectorAll(".dock .opendesk-rail-module-tile")
          .length,
        mark: document
          .querySelector(".dock .dock-logo .header-title")
          ?.textContent.trim(),
        apps: (frappe.boot.desk_apps || []).length,
      }));
      assert(
        state.on,
        "body is not marked opendesk-rail-on: the rail did not install"
      );
      // With App Menu the rail holds the open app's modules, under its mark.
      if (features.module_picker === "app_menu") {
        assert(state.modules > 0, "no module tiles on the rail");
        return `${state.mark}: ${state.modules} module tiles`;
      }
      assert(state.tiles > 0, "no app tiles on the rail");
      return `${state.tiles} tiles for ${state.apps} apps`;
    });

    await check("rail foot has Search and Notifications", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      if (!features.rail_tools)
        return { skip: "Move Search and Notifications to Rail is off" };
      const tools = await page.$$eval(
        ".opendesk-rail-tools [data-tool]",
        (els) => els.map((el) => el.dataset.tool)
      );
      assert(tools.includes("search"), `no search tile (${tools.join(", ")})`);
      return tools.join(", ");
    });

    await check("picking an app, and then a module", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      const picker = features.module_picker || "header";
      const name = PICKER_NAMES[picker] || picker;
      const app = await app_with_choice(page);
      if (!app) return { skip: "no other app with more than one module" };
      const { title } = app;
      await pick_app(page, title);
      await page.waitForTimeout(800);

      // Open Last Module: the pick went into the app. Another of its modules, then another app,
      // then this one again: it comes back to that module.
      if (features.app_pick !== "offer") {
        await settle(page);
        assert(
          await inside_app(page, title),
          `picking ${title} did not go into it`
        );
        const left = await page.evaluate((title) => {
          const sidebar = frappe.app.sidebar;
          const other = frappe.boot.desk_apps
            .find((a) => a.title === title)
            .modules.find(
              (m) =>
                frappe.boot.module_sidebars[m.shell] &&
                m.shell !== sidebar.current_module
            );
          sidebar.open_module(other.shell);
          return other.shell;
        }, title);
        await settle(page);
        // Open Last Sidebar Item: a row of that module too, whose page it should come back to.
        let page_left = null;
        if (features.app_pick === "enter_item") {
          const row = page
            .locator(
              ".body-sidebar .sidebar-items .standard-sidebar-item:not(.active-sidebar) > a.item-anchor[href^='/desk']"
            )
            .nth(1);
          if (await row.count()) {
            await row.click();
            await settle(page);
            page_left = await page.evaluate(() => window.location.pathname);
          }
        }
        const mode =
          features.app_pick === "enter_item"
            ? "Open Last Sidebar Item"
            : "Open Last Module";
        const trip = await round_trip(page, title);
        if (!trip) return `${name}, ${mode}: went into ${title}`;
        assert(
          trip.back === left,
          `${title} came back to ${trip.back}, not ${left}`
        );
        if (page_left)
          assert(
            trip.path === page_left,
            `${title} came back to ${trip.path}, not ${page_left}`
          );
        return `${name}, ${mode}: ${title}, back in ${
          page_left || left
        } after ${trip.other}`;
      }

      // Show Its Modules: the picker offers the app's modules over the page, and one opens it.
      const before = page.url();
      const landed = () =>
        before === page.url() ? "same page" : "a module page";

      if (picker === "sidebar") {
        const rows = await page.locator(".opendesk-module-row").count();
        assert(rows > 1, `${title}: the module list has ${rows} rows`);
        await page.locator(".opendesk-module-row").last().click();
        await settle(page);
        const listed = await page.evaluate(
          () => !!frappe.app.sidebar.opendesk_module_list
        );
        assert(!listed, "the module list stayed up after picking a module");
        return `${name}, Show Its Modules: ${title}, ${rows} rows, then ${landed()}`;
      }

      if (picker === "column" && (await column_on(page))) {
        const shown = await page.evaluate(() =>
          document.querySelector(".opendesk-column-title").textContent.trim()
        );
        assert(shown === title, `the column shows ${shown}, not ${title}`);
        const rows = await page.locator(".opendesk-column-row").count();
        assert(rows > 1, `${title}: the column has ${rows} rows`);
        await page.locator(".opendesk-column-row").last().click();
        await settle(page);
        const browsing = await page.evaluate(
          () => !!frappe.app.sidebar.opendesk_browsing
        );
        assert(!browsing, "the column kept the picked app after a module");
        return `${name}, Show Its Modules: ${title}, ${rows} rows, then ${landed()}`;
      }

      if (
        ["app_menu", "tabs", "accordion_rail", "accordion_sidebar"].includes(
          picker
        ) &&
        (await beside_on(page))
      ) {
        // The band, the app's tray or the sidebar's bars show the app, over the page.
        const browsing = await page.evaluate(
          () => (frappe.app.sidebar.opendesk_browsing || {}).app?.title
        );
        assert(browsing === title, `${title} is not on show (${browsing})`);
        const rows = {
          app_menu: ".dock .opendesk-rail-module-tile",
          tabs: ".opendesk-tabs-row .opendesk-tab:not(.hidden)",
          accordion_rail: `.dock .opendesk-rail-app[aria-label="${title}"] + .opendesk-rail-group:not(.opendesk-rail-group-folded) .opendesk-rail-module`,
          accordion_sidebar:
            ".body-sidebar .opendesk-accordion-module .item-anchor",
        }[picker];
        const count = await page.locator(rows).count();
        assert(count > 1, `${title}: ${count} modules on show`);
        await page.locator(rows).last().click();
        await settle(page);
        assert(
          await inside_app(page, title),
          `the module did not open ${title}`
        );
        const still = await page.evaluate(
          () => !!frappe.app.sidebar.opendesk_browsing
        );
        assert(!still, `${title} stayed on show after a module`);
        return `${name}, Show Its Modules: ${title}, ${count} modules, then ${landed()}`;
      }

      // The Module Menu, and every other picker below 768px: the header's menu picks.
      await page.waitForSelector(MENU_ROWS, { timeout: 5000 });
      const rows = await page.$$eval(MENU_ROWS, (els) =>
        els.map((el) => el.textContent.trim())
      );
      assert(
        rows.includes(app.last),
        `${title}: the menu has no ${app.last} (${rows.join(", ")})`
      );
      await page
        .getByRole("menuitem", { name: app.last, exact: true })
        .first()
        .click();
      await settle(page);
      const open = await page.evaluate(
        () =>
          !!frappe.app.sidebar.opendesk_picker_app ||
          !!document.querySelector('[role="menu"]')
      );
      assert(!open, "the module picker stayed open after picking a module");
      return `${name}, Show Its Modules: ${title}, ${
        rows.length
      } rows, then ${landed()}`;
    });

    await check("the header menu opens", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      // Beside the band of tabs the header is not drawn when its menu would hold nothing, and
      // Edit Sidebar is the corner's button.
      const hidden = await page.evaluate(() =>
        document
          .querySelector(".body-sidebar .sidebar-header")
          ?.classList.contains("opendesk-header-hidden")
      );
      if (hidden) {
        const edit = await page
          .locator(".body-sidebar .opendesk-edit-sidebar:not(.hidden)")
          .count();
        assert(edit, "no Edit Sidebar button in the sidebar's corner");
        return "not drawn beside the band, with Edit Sidebar in the corner";
      }
      // The Sliding Sidebar's header is a label when its menu would hold nothing: then a click
      // on it must open nothing, and Edit Sidebar is the corner's button.
      const plain = await page.evaluate(() =>
        document
          .querySelector(".body-sidebar .sidebar-header")
          ?.classList.contains("opendesk-header-plain")
      );
      if (plain) {
        await page.locator(".body-sidebar .sidebar-header").first().click();
        await page.waitForTimeout(400);
        const opened = await page.locator(MENU_ROWS).count();
        assert(!opened, "the plain header opened a menu");
        const edit = await page
          .locator(".body-sidebar .opendesk-edit-sidebar:not(.hidden)")
          .count();
        assert(edit, "no Edit Sidebar button in the sidebar's corner");
        return "a label, with Edit Sidebar in the corner";
      }
      const rows = await header_rows(page);
      assert(rows.length > 0, "the header menu is empty");
      // Beside the module column, the band or an accordion the modules are not in it, and one
      // row is the header itself.
      if (!(await beside_on(page)))
        assert(rows.length > 1, `only ${rows.join(", ")} in the header menu`);
      return rows.length === 1
        ? `one row, on the header: ${rows[0]}`
        : `${rows.length} rows`;
    });

    // ---------------------------------------------------------------------------- user menu
    await check(
      "Help and the site's tools moved into the user menu",
      async () => {
        if (!features.user_menu)
          return { skip: "Move Help and Site Tools to User Menu is off" };
        const header = await header_rows(page);
        await page
          .locator(".dock .dock-user, .body-sidebar .sidebar-user")
          .first()
          .click();
        await page.waitForTimeout(400);
        const user = await page.$$eval(MENU_ROWS, (els) =>
          els.map((el) => el.textContent.trim())
        );
        await page.keyboard.press("Escape");
        assert(!header.includes("Help"), "Help is still in the header menu");
        assert(user.includes("Logout"), "the user menu did not open");
        return `user menu: ${user.length} rows${
          user.includes("Help") ? ", Help among them" : ""
        }`;
      }
    );

    // ------------------------------------------------------------------------------ editors
    const can_manage = await page
      .evaluate(
        () =>
          !!(
            window.opendesk &&
            opendesk.rail &&
            opendesk.rail.can_manage &&
            opendesk.rail.can_manage()
          )
      )
      .catch(() => false);

    await check("Manage Desk Apps opens and lists every app", async () => {
      if (!features.navigation_rail && !features.apps_screen)
        return { skip: "the rail and the Apps screen are off" };
      if (!can_manage) return { skip: `${USER} may not edit Desk Apps` };
      await page.evaluate(() => opendesk.rail.manage_rail());
      await page.waitForSelector(".modal.show .ws-arrangement-item", {
        timeout: 15000,
      });
      const rows = await page
        .locator(".modal.show .ws-arrangement-item")
        .count();
      let detail = `${rows} rows`;
      if (features.apps_screen) {
        const buttons = await page
          .locator(".modal.show .opendesk-screen-mode")
          .count();
        assert(buttons > 0, "no row has an Apps Screen setting");
        if (features.navigation_rail) {
          await page
            .locator(
              ".modal.show .opendesk-preview-switch button[data-view=screen]"
            )
            .click();
          await page.waitForTimeout(400);
        }
        const tiles = await page
          .locator(".modal.show .opendesk-screen-tile")
          .count();
        assert(tiles > 0, "the Apps screen preview drew no tiles");
        detail += `, ${buttons} Apps Screen settings, ${tiles} preview tiles`;
      }
      await close_dialogs(page);
      return detail;
    });

    await check("Manage Modules opens from the module picker", async () => {
      if (!features.navigation_rail)
        return { skip: "Override Navigation Rail is off" };
      if (!can_manage) return { skip: `${USER} may not edit Desk Apps` };
      const picker = features.module_picker || "header";
      const app = await app_with_choice(page);
      if (!app) return { skip: "no app with more than one module" };
      const { title } = app;
      await pick_app(page, title);
      await page.waitForTimeout(800);
      // With Open Last Module that went into the app; picked again, it offers the modules.
      if (features.app_pick !== "offer") {
        await settle(page);
        await pick_app(page, title);
        await page.waitForTimeout(800);
      }
      if (picker === "sidebar") {
        // From the module list's header.
        await page.locator(".body-sidebar .sidebar-header").first().click();
      } else if (picker === "column" && (await column_on(page))) {
        // From the column's foot. Hidden while the column is folded, so clicked from the script.
        await page.evaluate(() =>
          document.querySelector(".opendesk-column-manage").click()
        );
      } else if (picker === "tabs" && (await tabs_on(page))) {
        // From the band's end.
        await page.locator(".opendesk-tabs-manage").click();
      } else if (
        (picker === "app_menu" || picker.startsWith("accordion")) &&
        (await beside_on(page))
      ) {
        // Manage Modules is in the header's menu.
        await page.keyboard.press("Escape");
        await page.locator(".body-sidebar .sidebar-header").first().click();
        await page.waitForSelector(MENU_ROWS, { timeout: 5000 });
        await page
          .getByRole("menuitem", { name: "Manage Modules", exact: true })
          .click();
      } else {
        // The menu's last row.
        await page.waitForSelector(MENU_ROWS, { timeout: 5000 });
        await page
          .getByRole("menuitem", { name: "Manage Modules", exact: true })
          .click();
      }
      await page.waitForSelector(".modal.show .ws-arrangement-item", {
        timeout: 15000,
      });
      const rows = await page
        .locator(".modal.show .ws-arrangement-item")
        .count();
      await close_dialogs(page);
      await page.keyboard.press("Escape");
      return `${title}: ${rows} rows`;
    });

    // --------------------------------------------------------------------------- Apps screen
    await check("Apps screen draws and offers Manage Desk Apps", async () => {
      await page.goto(`${BASE}/desk`);
      await settle(page, 2000);
      const state = await page.evaluate(() => ({
        page: frappe.boot.desktop_page,
        tiles: document.querySelectorAll(".desktop-container .desktop-icon")
          .length,
        expected: (frappe.boot.app_data || []).filter((a) => a.on_apps_screen)
          .length,
      }));
      if (state.page !== "Apps")
        return { skip: `Desktop Settings shows ${state.page}` };
      assert(
        state.tiles === state.expected,
        `${state.tiles} tiles for ${state.expected} entries`
      );
      let detail = `${state.tiles} tiles`;
      if ((features.navigation_rail || features.apps_screen) && can_manage) {
        await page.locator(".desktop-avatar").click();
        await page.waitForTimeout(400);
        const rows = await page.$$eval(MENU_ROWS, (els) =>
          els.map((el) => el.textContent.trim())
        );
        await page.keyboard.press("Escape");
        assert(
          rows.some((row) => /^Manage Desk Apps$/.test(row)),
          `no Manage Desk Apps in the avatar menu (${rows.join(", ")})`
        );
        detail += ", Manage Desk Apps in the avatar menu";
      }
      return detail;
    });

    await check(
      "an Apps screen tile does what picking its app does",
      async () => {
        if (!features.navigation_rail)
          return { skip: "Override Navigation Rail is off" };
        const title = await page.evaluate(() => {
          const tiles = [
            ...document.querySelectorAll(
              ".desktop-container .desktop-icon .icon-title"
            ),
          ];
          const apps = frappe.boot.desk_apps || [];
          for (const tile of tiles) {
            const app = apps.find((a) => a.title === tile.textContent.trim());
            const href = tile.getAttribute("href") || "";
            const choices =
              app &&
              (app.modules || []).filter(
                (m) => frappe.boot.module_sidebars[m.shell]
              ).length + (app.frontend ? 1 : 0);
            if (choices > 1 && /^\/(desk|app)(\/|$)/.test(href))
              return app.title;
          }
          return null;
        });
        if (!title) return { skip: "no desk tile for an app with a choice" };
        await page
          .locator(".desktop-container .desktop-icon .icon-title", {
            hasText: title,
          })
          .first()
          .click();
        await settle(page, 2000);
        const picker = features.module_picker || "header";
        if (features.app_pick !== "offer") {
          // Open Last Module: the tile went into the app, to the module last open in it.
          assert(await inside_app(page, title), `${title}: landed elsewhere`);
          const opened = await page.evaluate((title) => {
            const app = frappe.boot.desk_apps.find((a) => a.title === title);
            const last = JSON.parse(
              localStorage.getItem("opendesk-last-modules") || "{}"
            )[app.key];
            return { last, now: frappe.app.sidebar.current_module };
          }, title);
          assert(
            !opened.last || opened.last === opened.now,
            `${title}: opened ${opened.now}, not ${opened.last}`
          );
        } else if (picker === "sidebar") {
          const listed = await page.evaluate(
            () => !!frappe.app.sidebar.opendesk_module_list
          );
          assert(listed, `${title}: landed without the module list`);
        } else if (picker !== "header" && (await beside_on(page))) {
          // It lands in the app's first module: the column, the band, the rail or the sidebar
          // shows that app.
          assert(await inside_app(page, title), `${title}: landed elsewhere`);
          if (picker === "tabs") {
            const shown = await tabs_title(page);
            assert(shown === title, `${title}: the band shows ${shown}`);
          }
        } else {
          const picked = await page.evaluate(() => {
            const app = frappe.app.sidebar.opendesk_picker_app;
            return {
              app: app && app.title,
              menu: !!document.querySelector('[role="menu"]'),
            };
          });
          assert(
            picked.app === title && picked.menu,
            `${title}: landed without the module picker (${picked.app})`
          );
          await page.keyboard.press("Escape");
        }
        return title;
      }
    );

    await check("no script errors", async () => {
      assert(!page_errors.length, page_errors.slice(0, 3).join(" | "));
      return console_errors.length
        ? `${
            console_errors.length
          } console errors (not failures): ${console_errors
            .slice(0, 2)
            .join(" | ")}`
        : "";
    });
  } finally {
    await close_dialogs(page).catch(() => {});
    // Log out, so the run leaves no session behind.
    await context.request.get(`${BASE}/api/method/logout`).catch(() => {});
    await browser.close();
  }

  const marks = { pass: "✓", fail: "✗", skip: "–" };
  for (const r of results)
    console.log(
      `${marks[r.status]} ${r.name}${r.detail ? `  (${r.detail})` : ""}`
    );
  const failed = results.filter((r) => r.status === "fail").length;
  console.log(
    `\n${results.length - failed} of ${results.length} passed or skipped${
      failed ? `, ${failed} failed` : ""
    }`
  );
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
