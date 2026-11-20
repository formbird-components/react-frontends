# react-internal (SDMS)

Formbird's internal service desk (SDMS) as a React single-page app. It covers items: bugs, features,
change requests and the rest. It uses **fieldtec-web as its backend**, on a demo
database of its own (`react-internal-demo`) shaped like `internal-5`, or on a copy of `internal-5`.

It replaces four Formbird templates and their client rulesets with React code:

| Formbird template | Here |
|---|---|
| My View `f32df2e3-…` (My View - onFieldState) | **My View** `/my-view` |
| All Items `b33ed5ee-…` (All Items - onFieldState), plus the SDMS Bulk Item Updater it opens | **All Items** `/items` |
| Item `376eb771-…` (New Item - onFieldState, New Item - PreSaveClient) | **Item** `/items/new`, `/items/:ref` |
| My Recent Documents `18412ae0-…` | **Recent** `/recent` |

There are no templates, client rulesets or custom elements on screen: every page, form and behaviour
is React code. fieldtec-web stores and searches the documents and signs people in. On every save it
runs the Item's **server** rule (SDMS Item - PreSaveServer), as it does for Formbird's own form. That
rule numbers new items, sets their keys, and queues emails to the people on the item.

The app is part of the `~/git/react-frontends` workspace. Its foundation is shared with the fleet
app: the fieldtec-web client, session, UI kit, app shell, dev server and test harness all live in
`@react-frontends/shared` (`../shared`).

## Set up

You need:
- Node.js 22+ and pnpm.
- MongoDB, Elasticsearch and Redis running (`~/dev/core-setup-docker`).
- [solidjs-components](../../solidjs-components/README.md) checked out and installed beside the
  workspace: `pnpm db:setup` loads the database with its platform package.
- fieldtec-web checked out beside the workspace (e.g. `~/git/fieldtec-web`), with its server built:
  `(cd ~/git/fieldtec-web/projects/server && node build.mjs)`.

```sh
cd ~/git/react-frontends
pnpm install          # once, for the whole workspace
cd internal
pnpm db:setup         # once: the SDMS demo database, react-internal-demo (--reset to start again)
pnpm dev              # fieldtec-web on :3003 (react-internal) + the app on http://localhost:5191
```

**The demo database.** `pnpm db:setup` (`scripts/db-setup.mjs`) builds it from `demo/catalog.mjs`
with `demo/build.mjs`, under the ids the app knows (`src/domain/model.ts`):
- 4 projects (one inactive), each picking its lookup values in its own way ("Global Default",
  "Project Specific", "Combined");
- statuses, types, severities, priorities, reproducibility, categories, resolutions and tags;
- 6 people with the SDMS application and their projects. One is an SDMS admin; one works on a single
  project.
- 35 items with notes, @mentions, relationships, progress notes and a migrated Mantis history,
  plus the SDMS emails My View lists as notifications;
- user configurations with saved filters;
- the Item template and its server rule. The template's Reference No field numbers new items (1236,
  1237…). The rule pads the number into `itemId`, defaults the status to New and stamps who/when.
  Unlike the real rule, it queues no emails.

It also writes `server/config/react-internal.json` and flushes Redis database 4.

`pnpm dev` (`scripts/dev.mjs`, using shared's `startDev`) does three things:
1. **Writes its own fieldtec-web config.** It writes `server/config/react-internal.json` in the
   fieldtec-web checkout, from `development.json`:
   - the `react-internal-demo` database and search index (or `INTERNAL_DB`'s);
   - port 3003 and Redis database 4;
   - email/password sign-in only (no SSO).

   It rewrites only that file, which it marks as its own. fieldtec-web's `internal-5.json` is left
   alone. That config searches the `formbird` index, which holds another database's documents (140
   items, not internal-5's 15,830).
2. **Starts fieldtec-web** with that config. Its output is shown dimmed and saved to
   `logs/fieldtec-web.log`. If something already answers on :3003, it uses that instead.
3. **Starts the app** on :5191, which proxies `/api` and `/auth` to fieldtec-web so its session
   cookie works.

Ctrl+C stops both (fieldtec-web gets SIGINT; SIGTERM would make it save a shutdown error document
into the database).

| Setting | Default | |
|---|---|---|
| `FIELDTEC_WEB` | the nearest `fieldtec-web` beside the workspace | Where fieldtec-web is checked out |
| `INTERNAL_DB` | `react-internal-demo` | The database and index: `internal-5` for a local copy of the real one |
| `SOLIDJS_COMPONENTS` | the nearest `solidjs-components` beside the workspace | Where solidjs-components is checked out (`pnpm db:setup`) |
| `FIELDTEC_CONFIG` | | Run this existing `server/config/<name>.json` instead (writes nothing) |
| `FIELDTEC_URL` | | A backend already running elsewhere: start nothing, proxy to it |
| `PORT` | `5191` | The app's port |
| `ALLOWED_HOSTS` | | More host names the dev server answers. Coder's forwarded ports (`*.coder.formbird.com`) are already allowed. |

`pnpm dev:app` starts only the app, proxying to `FIELDTEC_URL` or http://localhost:3003.

**Behind the demo portal.** `solidjs-components/portal/run.sh up` also serves this app at `/react-sdms/`
on the portal's port (8080), beside the Solid demos. It builds the app for that path
(`APP_BASE=/react-sdms/`, into `dist-portal/`) and starts its fieldtec-web; nginx passes
`/react-sdms/api` and `/react-sdms/auth` to it. The listing comes from `scripts/portal.mjs`.

**Signing in.** On the demo database, sign in as any of these. Every password is `Sdms1234!`.

| Person | |
|---|---|
| `hannah.cole@example.com` | Product Manager, SDMS admin (sees every project) |
| `daniel.okafor@example.com` | Senior Developer |
| `mei.lin@example.com` | Developer |
| `ravi.patel@example.com` | QA Engineer |
| `sam.taylor@example.com` | Support Lead (reporter) |
| `emma.walsh@example.com` | Customer Success, on one project only |

On `internal-5`, use your own email and password. Through Coder, open
`5191--main--<workspace>.coder.formbird.com`.

**With `INTERNAL_DB=internal-5`, saving writes to internal-5.** It's the database Formbird's own SDMS forms use here. Each item
save also queues email documents (`system.emailMessage`) for the reporter, assignee, monitors,
feedback requestees and anyone @mentioned. Nothing is actually sent locally: the config has no
email settings, and the queue only sends when `clientConfiguration.emailMessaging.sendEmails` is
set.

## Pages

| Page | What it does |
|---|---|
| **My View** `/my-view` | **Lists:** eight tiles with live counts (assigned to me, feedback requested of me, unassigned, reported by me, resolved, recently updated, monitored by me, deferred); a tile shows its list. **My board:** your open items by status (statuses 10–59, as the project's settings choose), in lanes by assignee. Drag a card, or use its "Move to…" menu, to change its status or assignee. **Notifications:** the SDMS emails sent to you, linked to their items. A project filter (your projects; admins may show all) scopes everything, and is remembered. |
| **All Items** `/items` | Filter by created/updated period, reporter, assignee, type, severity, priority, reproducibility, category, status, resolution, tags, and "hide status (and above)", plus a text search. The whole view is in the address. **Saved filters** (load, save, rename, delete) are stored in your SDMS user configuration, where Formbird's form also reads them. A column chooser, CSV export, and **bulk** Update, Move or Copy of the selected items, item by item with results. "Add note" when one item is selected. |
| **Item** `/items/31492`, `/items/new` | The item is the form. Fields are edited in place; a save bar appears when something changed, and you're warned before leaving with unsaved changes. Properties sit in a side panel. Description, steps and additional information are Markdown with preview. Typing `@` suggests people and `#` suggests items. The page also has details, attachments, relationships (link and unlink up to 10, both sides), the AI snapshot and progress note, notes (add, edit your own), documentation, and history. `:ref` is the item's number (31492 or 0031492) or its document id. "Copy link" gives `/items/<number>`. |
| **Recent** `/recent` | The documents whose latest version you saved, newest first; items open here. Admins can look at another person's. |

⌘K searches items by number or text, and goes to pages.

## How the rules map

The client rules are ported to `src/domain` as plain functions, unit-tested in `src/domain/test`:
- `queries.ts`: the Elasticsearch requests;
- `rules.ts`: the behaviour.

| Original rule | Here |
|---|---|
| Project Access include (last project in `localStorage.sdmsProjectRel`; one-project people get theirs, locked) | `rememberedProject`/`rememberProject` (`data/sdms.ts`), `newItemDefaults`, `formState` (`single-project`) |
| ruleApplyProjectfilters / ruleApplyProjectFilters (a project's "Global Default", "Project Specific", "Combined" setting per lookup) | `lookupQuery`, used by `LookupPicker` |
| ruleFilterAccounts, ruleSetReporterAssignee (people = active SDMS accounts on the project) | `peopleQuery`, `PeoplePicker` |
| ruleSetProjectfilter, ruleShowAdminProjectAll (your projects; SDMS admins may show all) | `projectOptionsQuery`, `projectScope`, `adminAccessQuery`/`useIsAdmin` |
| ruleDisableConfig, ruleDisableItemOnClose (#31244: the **saved** closing status locks the item, except status and progress note), ruleProjectDisabled (inactive project locks everything), rulePreventSaveNonCurrent | `formState` and `LOCK_REASONS` |
| ruleSetReporterRel, ruleSetCreatedByRel, Authorship Functions (updatedByRel/updatedDate on save) | `newItemDefaults`, `authorship` |
| ruleQuickStatusNoteBtnVisibility / ruleQuickStatusNoteDialog / ruleAppendQuickStatusNote | `offersQuickNote`, `newNote`/`withNote`; the closing note beside Status |
| ruleTriggerPendingSummaryDescription, ruleOnProgressNoteChange | `changeFlags` (snapshot pending at save; "Disable AI override" ticked as you type the progress note, and can be unticked) |
| ruleGetAtNamesInNotes (@firstlast → `[@FirstLast](mailto:…)`) | `linkMentions`, plus `@` suggestions in the editor |
| ruleUrlIdHelper (`#12345` → `[0012345](/form/<id>)`) | `linkItemRefs`, plus `#` suggestions; the app opens `/form/<id>` links on its item page (`appLinkFor`) |
| ruleAddRelationships / ruleRemoveRelationships (reciprocal Parent↔Child, at most 10) | `planLink`, `planUnlink` |
| ruleLoadVersions, ruleDisplayHistoryOldData | `versionsQuery` (all versions), `versionHistory`; the migrated Mantis history table |
| My View ruleSetFilters, ruleSetupBoard / ruleLoadBoard / ruleRefreshBoard | `myViewQuery`, `boardStatusQuery`, `boardColumns`, `boardItemsQuery`, `lanesOf`, `byUrgency`, `boardMove` |
| All Items ruleSetTasksDtFilter, ruleSetCreatedDateFilter | `allItemsQuery`, `presetRange`, `hiddenStatusNames`, `textSearch` |
| All Items saved filters (ruleLoadFilter, ruleSaveFilter, ruleRenameFilter, ruleDeleteFilter) | `toSavedFilter`, `putSavedFilter`, `renameSavedFilter`, `removeSavedFilter` (same field names as Formbird's) |
| Bulk Item Updater (Update, Move, Copy) | `bulkChange`, `moveChange`, `copyOf` |
| New Item - PreSaveServer (numbers, keys, emails) | Not here: the server still runs it. |

**Differences from the originals.**

*Bugs fixed:*
- All Items applies the Resolution filter (the rule never read it).
- Board moves stamp `updatedByRel` (the rule wrote `updateByRel`).
- Each version in the history is attributed to its own author.

*Deliberate changes:*
- A preset period ("Last 30 days") is recalculated when a saved filter loads, rather than reusing the dates saved with it.
- Deferred follows the project filter on My View.
- Linking only offers items on your projects (ruleFilterAddItemsRel).
- Notes this app writes have raw HTML escaped outside code.

## Testing

```sh
pnpm check            # typecheck + unit tests (domain rules, queries, page logic) + build
pnpm test:e2e:sim     # every page, signed in, against a stand-in backend (no fieldtec-web, no writes)
pnpm test:e2e         # with `pnpm dev` running: signed out; with SDMS_EMAIL + SDMS_PASSWORD, every page signed in (read-only)
```

**The stand-in backend.** `e2e/sim-backend.mjs` stands in for fieldtec-web:
- It answers the app's routes from the local `internal-5` search index, and keeps saves in memory.
- It writes nothing to internal-5 and emails nobody.
- It doesn't check passwords (any SDMS account's email signs in), doesn't apply keys, and runs no
  server rules.
- It never sends password fields.

`pnpm test:e2e:sim` starts it and the app itself. It then signs in as the person with the most open
items and walks the whole app: My View (lists, board, notifications), ⌘K, a closed item (locks,
progress note save), a new item (validation, create), All Items (search, bulk update) and Recent. It
also checks each page on a phone in dark mode. `SCREENSHOTS=<dir>` keeps screenshots.
`SIM_INDEX=react-internal-demo pnpm test:e2e:sim` walks the demo database's index instead (the walk
then picks the project "Field Platform" and searches for "offline"; `SIM_PROJECT` and `SIM_SEARCH`
change those).

To click around by hand without touching internal-5:
`node e2e/sim-backend.mjs` (:3903), then `FIELDTEC_URL=http://localhost:3903 pnpm dev:app`.

## Layout

```
src/app/          the shell (brand, nav, ⌘K item search), router
src/features/     my-view, items/all-items, items/item, recent, auth
src/components/   item bits (status, type icon, links), pickers (lookups, people, projects), the items table, Markdown
src/data/         SDMS queries as hooks (account, admin, projects, lookups, people, items by number), saving an item
src/domain/       types, ids, the ported rules (rules.ts) and queries (queries.ts), with tests
e2e/              smoke test (run.mjs), whole-app test on the stand-in (sim.mjs), the stand-in (sim-backend.mjs)
demo/             the demo database: what it holds (catalog.mjs) and its documents (build.mjs)
scripts/          pnpm dev (dev.mjs), pnpm db:setup (db-setup.mjs), and this app's config (config.mjs)
```

## Not done

- **Attaching files.** Attachments are shown and open, but uploading isn't built. It needs
  fieldtec-web's `POST /api/uploadFiles` (multipart: `fileNo`, `file`, `documentId`,
  `documentName`, `fileReferenceTemplateId` 4647f01a-…), then `fileAttachArr` updated with the
  returned `{ fileNo, basePath, fileType }`. The stand-in can't test it.
- **Versions.** The demo database and the local internal-5 copy hold current versions only, so an item's history shows
  one entry, plus the migrated Mantis history. There is no viewer for an old version.
- **Left out on purpose.** The templates' links to other Formbird forms are out: New Release, Team
  Intrays Board, Release Tracker, Trust Center, Environment Logs and Management, and the admin menu.
  So are Private Notes (hidden in the original), the help button, and email settings (the SDMS user
  configuration's other fields).
