# react-fleet

The fleet app (bookings, the asset register, Daily Driver checks, the workshop, fuel and a fleet
map) as a React single-page app, with **fieldtec-web as its backend**.

It is a React version of [solidjs-components-fleet](../../solidjs-components/solidjs-components-fleet/README.md),
with one difference in approach. That repo runs inside Formbird's own front end: Formbird templates
lay out the forms, client rulesets drive them, and SolidJS custom elements (microfrontends) fill in
the rich parts. Here there are no templates on screen, no client rulesets and no custom elements:
every page, form and behaviour is React code in this repo. fieldtec-web stores the records,
searches them (Elasticsearch), signs people in, and runs its server-side rules on every save.

## How it uses fieldtec-web

| What | fieldtec-web route | Here |
|---|---|---|
| Sign in / out | `POST /auth/login/local` `{ email, pass }`, `POST /auth/logout` | the shared API client and session (`@react-frontends/shared/api`, `/data`) |
| Who is signed in | `GET /api/loggedUser` | the session; `accountType` decides menus and permissions |
| Lists, counts, calendars | `POST /api/documentSearch` (Elasticsearch `{ query, sort }`, `size`, `page`, `sourceFilter`) | `useSearch` (`src/data/records.ts`, on the shared one) |
| One record | `GET /api/document/:id` | `useRecord` |
| Create | `POST /api/document` (with the template id) | `useCreate(kind)` |
| Change | `PUT /api/document/:id` (only the changed fields) | `useUpdate(kind)` |

- **One origin.** Vite serves the app and proxies `/api` and `/auth` to fieldtec-web, so its session
  cookie works without CORS. In production, put the built app and fieldtec-web behind one reverse
  proxy the same way.
- **The server still decides.** The fleet demo's PreSaveServer and PostSave rules run on every save:
  - they number records (BK-, REQ-, WO-, CHK-, FR-);
  - they work out hire cost and duration, distance, fuel flags and consumption;
  - they take an asset off hire while it is in the workshop;
  - they raise a workshop request from a failed Daily Driver check;
  - they refuse invalid saves.
- **The app checks first.** fieldtec-web answers a refused update with a generic "Error updating
  document". So every form runs the same checks before saving (`src/domain/validate.ts`, with the
  server rules' exact messages) and explains what to fix.
- **Search is a second behind.** Elasticsearch sees a save about a second later, and PostSave rules
  update other records after the response. Lists refresh again after a moment
  (`useRefresh`, from `@react-frontends/shared/data`).

## Set up

You need:
- Node.js 22+ and pnpm.
- fieldtec-web checked out beside this repo's folder (e.g. `~/git/fieldtec-web`), with its server
  built: `(cd ~/git/fieldtec-web/projects/server && node build.mjs)`.
- MongoDB, Elasticsearch and Redis running (`~/dev/core-setup-docker`).
- [solidjs-components](../../solidjs-components/README.md) checked out beside this workspace, with
  [solidjs-components-fleet](../../solidjs-components/solidjs-components-fleet/README.md)'s
  `pnpm db:setup` run once. Its seed builds this app's data too, and its templates reference the
  bundles that setup builds.

This app is one package of the `~/git/react-frontends` pnpm workspace (with `shared` and `internal`):
install once at the workspace root, then run the app from its folder.

```sh
cd ~/git/react-frontends && pnpm install     # the whole workspace: one lockfile, one copy of each package
cd fleet
pnpm db:setup     # once: this app's own database, react-fleet-demo (--reset to start again)
pnpm dev          # fieldtec-web on :3006 (react-fleet) + the app on http://localhost:5190
```

`pnpm db:setup` (`scripts/db-setup.mjs`, calling `setupDatabase` from `@react-frontends/shared/dev/db-setup`):
- builds the Solid fleet demo's documents (templates, server rules, people, assets, bookings…);
- loads them into a database and Elasticsearch index of this app's own, `react-fleet-demo`, so
  saving here never changes the Solid demo's data;
- writes `server/config/react-fleet.json` (port 3006, Redis database 7: `scripts/config.mjs`) and
  flushes that Redis database.

`pnpm dev` (`scripts/dev.mjs`, calling `startDev` from `@react-frontends/shared/dev`):
1. Rewrites `server/config/react-fleet.json` from `development.json` and starts fieldtec-web from its
   checkout with it. Its output goes to the terminal (dimmed) and to `logs/fieldtec-web.log`.
2. Waits until fieldtec-web answers, then starts the app.

If fieldtec-web is already running on that port, it uses that instead. Ctrl+C stops both. (It stops fieldtec-web with SIGINT, as
Ctrl+C does: on SIGTERM fieldtec-web saves an "error document" to its database.)

| Setting | Default | |
|---|---|---|
| `FIELDTEC_WEB` | the nearest `fieldtec-web` beside this repo or a folder above it | Where fieldtec-web is checked out |
| `FIELDTEC_CONFIG` | `react-fleet` | Run another existing `server/config/<name>.json` instead, e.g. `solid-fleet` for the Solid demo's data (its `port` is the backend's) |
| `FIELDTEC_URL` | | A backend already running elsewhere: start nothing, proxy to it |
| `PORT` | `5190` | The app's port |
| `ALLOWED_HOSTS` | | More host names the dev server answers (comma-separated). Coder's forwarded ports (`*.coder.formbird.com`) are already allowed. |

`pnpm dev:app` starts only the app (Vite), proxying to `FIELDTEC_URL` or http://localhost:3006.

**Behind the demo portal.** `solidjs-components/portal/run.sh up` also serves this app at `/react-fleet/`
on the portal's port (8080), beside the Solid demos. It builds the app for that path
(`APP_BASE=/react-fleet/`, into `dist-portal/`) and starts its fieldtec-web; nginx passes
`/react-fleet/api` and `/react-fleet/auth` to it. The listing comes from `scripts/portal.mjs`.

`shared/dev/server-deps.cjs` is a preload fieldtec-web runs with. It resolves the server's packages
from `projects/server`, because a checkout's root `node_modules` may hold older copies that break the
server. It is copied from solidjs-components-shared.

Sign in as any of the fleet demo's people; every password is `Fleet1234!`. The sign-in page lists them:

| Person | Account type | Starts on |
|---|---|---|
| `olivia.bennett@example.com` | Administrator | Overview |
| `marcus.reid@example.com` | Asset Manager | Overview |
| `priya.shah@example.com` | Supervisor (workshop) | Workshop |
| `tom.nguyen@example.com` | Technician | Workshop |
| `grace.kim@example.com` | Operator | Daily Driver |
| `sofia.russo@example.com` | Driver | Bookings |

What people may do follows their account type (`src/domain/workflow.ts`, matching the access keys
the server's rules check):
- Asset Managers manage the asset lifecycle and may book beyond an asset's limit.
- The workshop (Supervisors, Technicians) moves requests and work orders.
- Supervisors triage, close and cancel requests.

## Pages

| Page | What it does |
|---|---|
| **Overview** `/overview` | Live counts that open the matching filtered list: available, on hire, hire overdue, unavailable, services due, rego due, open requests, bookings today. Also today's pickups and returns, what needs attention, three charts (bookings per day, fuel spend, utilisation), a fleet map and the workshop queue. |
| **Bookings** `/bookings` | A calendar of assets by location, by day or week. Bars are in their status colour; overdue hires and workshop block-outs are marked. Drag across free time to book, click a booking to open it. Or a list with tabs (upcoming, on hire, overdue, past, cancelled). On a phone: one asset's day. |
| **New booking** `/bookings/new` | Assets you may book, each saying whether it's free for your times. Suggests free alternatives on a clash. Applies the booking time rules, shows an estimated cost, and lets managers book for others. |
| **Booking** `/bookings/:id` | Start the hire (meter), return it (meter, distance, late return), cancel (reason), or change times (with clash checks). Shows the hire cost and the activity. |
| **Assets** `/assets`, `/assets/:id` | The register with search and filters, as a table or cards. An asset's header, quick actions, a meter/service/rego strip, and tabs for its bookings, workshop history, checks and fuel. Managers edit the lifecycle and allocation. |
| **Workshop** `/workshop` | A board of requests by status. Drag a card to move it: only allowed moves are offered, and moves that need input ask for it. Also filters, a list view and KPIs. |
| **Request / work order** | Report a fault, triage, assign, schedule, defer, close. Work orders cover service checks, parts and labour with GST totals, hold, complete and reopen. |
| **Daily Driver** `/checks/new` | A phone-first stepper: asset, meter, the asset type's check sheet, defects, review. When a check fails, it links to the workshop request the server raises. |
| **Fuel** `/fuel` | Receipts with flags and a spend/litres/L-per-100-km chart. A new receipt checks consumption live. |
| **Map** `/map` | Assets by hire status and site boundaries, with filters, a list, and a card for the selected asset. |

Every page has loading, empty and error states, works in light and dark, and fits a phone.

## Layout

```
src/app/          the fleet in the shared shell: brand, pages by role, New menu, ⌘K searches; router
src/features/     one folder per area: overview, assets, map, bookings, workshop, checks, fuel, auth
src/components/   fleet-only UI: asset icons, the map, meter field, asset/person/lookup pickers
src/data/         the fleet on the shared data layer: session roles (who, me), templates and lookups,
                  searches, records and saving by record kind, related values
src/domain/       the fleet's types, workflows, validators, and logic (logic/: hire cost, booking
                  times, calendar maths, meters and fuel, line totals, service due, check sheets)
src/lib/          fleetQuery (fleet documents of a kind), money and meter formats
scripts/          pnpm dev (dev.mjs), pnpm db:setup (db-setup.mjs), and this app's config, react-fleet (config.mjs)
e2e/run.mjs       smoke test against a running backend, as each kind of person
```

What both apps (this one and `../internal`) use lives in **`../shared`** (`@react-frontends/shared`,
TypeScript source used as is, no build step), imported by subpath:

| Import | What |
|---|---|
| `@react-frontends/shared/api` | the fieldtec-web API client (`api`: signIn, signOut, me, search, get, create, update; `ApiError`, `whenSignedOut`, `configureApi`), `Doc`, `BaseAccount` |
| `/es` | Elasticsearch clauses (`term`, `terms`, `range`, `exists`, `contains`) and `boolQuery` (`fleetQuery` wraps it) |
| `/format`, `/utils` | dates, times, relative times, durations, numbers; `cn`, `initials`, `hueOf` |
| `/data` | `createQueryClient`, `SessionProvider`/`useSession`, `useSearch`, `useRecord`, `useRefresh`, `useCreateDocument`, `useUpdateDocument` |
| `/ui` | the UI kit (buttons, inputs, selects, dialogs, sheets, menus, tabs, tables, badges, avatars…) |
| `/components` | page header and layout, loading/empty/error/not-found states, markdown, date-time inputs, filter chips, KPI tiles, chart chrome, number input, status badge, pickers (`PickerPopover`, `Combobox`) |
| `/shell`, `/theme` | `AppShell` (sidebar, ⌘K palette, New menu, account menu, phone layout), `SignInPage`, `RequireSession`, `AppProviders`; light/dark theme |
| `/styles.css` | Tailwind, Inter, the design tokens (light and dark): `src/index.css` imports it and adds `@source` for shared's files |
| `/vite`, `/dev`, `/e2e` | the Vite config (`appConfig`), `pnpm dev` (`startDev`, with the server-deps preload), the e2e harness (Chrome, sign-in, console checks) |

## Commands

```sh
pnpm dev          # fieldtec-web (fleet demo config) + the app, with the proxy
pnpm typecheck
pnpm test         # unit tests (domain logic, validators, feature logic)
pnpm build        # dist/: static files for any web server that proxies /api and /auth
pnpm check        # all three
pnpm test:e2e     # with pnpm dev running: every page, as every kind of person
```

## Decisions

- **The logic is copied, not shared.** `src/domain/logic` is copied from solidjs-components-fleet's
  `packages/fleet-kit`, whose server rulesets run the same functions. A change to a rule must be made
  in both places. Sharing it would mean this repo depending on a checkout of the Solid repos.
- **Statuses and lookups come from the database** (`useLookup`), so colours and names match what the
  server stores. Templates are looked up by kind (`useTemplates`) rather than hard-coded ids.
- **What two apps need is shared, not copied.** The API client, data layer, UI kit, shell, styles and
  tooling are `../shared`; this app keeps what is the fleet's (its domain, features, map, pickers that
  know fleet records, and its role rules on top of the shared session).
- **Stack:** React 19, Vite 7, TypeScript, Tailwind CSS 4, Radix primitives, TanStack Query 5, React
  Router 7, MapLibre GL, Recharts, lucide icons, sonner, cmdk.
