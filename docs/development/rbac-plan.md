# RBAC (Role-Based Access Control) Plan

## Why

SecureZen's permission system is half-built. `RoleManagement.jsx` + the `sz_roles` table already let an admin create a role, assign a subset of 22 named permissions ("View Dashboard", "Manage Users", "Configure SMTP", etc.), even auto-generate a description with AI — but **none of it is enforced**. Checked directly:

- Backend (`backend/app/utils/auth.py`) only checks a hardcoded `"ROLE_ADMIN"` string on a handful of endpoints, and `ROLE_ADMIN`/`ROLE_DEMO` for a single generic write-permission check. It never reads the `permissions` list a role was actually configured with.
- Frontend (`App.jsx`) has a `hasPermission()` helper wired through to `Sidebar.jsx`, but Sidebar only calls it once, checking for a literal `'ROLE_ADMIN'` string that isn't even one of the 22 real permission names. Every nav item renders for every logged-in user regardless of role.

So today, building a role with only 3 permissions checked changes nothing — that user still sees every page and can hit every API route. This plan wires up real enforcement, using OpenUBA's Settings → Access tab (a per-role, per-page toggle grid) as the visual/UX reference the user asked for — layered on top of the richer named-permission model that already exists, not replacing it.

## Where the design comes from

**[OpenUBA](https://github.com/GACWR/OpenUBA)** Settings → Access tab: one page per role, a table of every page in the product with a Read toggle and a Write toggle per row, a single Save button. Simple, visual, admin-friendly. This plan borrows that *shape* — a page-level matrix — for a new "Access" tab, but the underlying storage stays SecureZen's existing named-permission list (already more granular than OpenUBA's binary read/write, e.g. distinguishes "View Dashboard" from "Manage Users" from "Export Reports").

## Core concept

- **Permission key** — a canonical string per sidebar page (`view:ueba-overview`, `view:assets`, `manage:users`, ...). Reconciled against the existing 22-item `ALL_PERMISSIONS` list in `RoleManagement.jsx` — most already exist by a different name, some are missing entirely (UEBA, Assets, Command Center didn't exist when that list was written).
- **Enforcement, not just storage** — every sidebar nav item checks `hasPermission(pageKey)` before rendering; every corresponding FastAPI router gets a `require_permission(pageKey)` dependency that reads the same `permissions` list already computed by `get_permissions_for_roles()`.
- **Two editing surfaces, one data model** — the existing dual-list-swapper modal in `RoleManagement.jsx` stays (it's good, keep it), and a new Settings → Access tab adds a faster page-level matrix view for the common case. Both write to the same `sz_roles.permissions` column.
- **Admin bypass stays absolute** — `ROLE_ADMIN` always has full access regardless of the matrix, same as OpenUBA ("Admin always has full access").

## Full page → permission map (23 sidebar views today)

| Sidebar view key | Existing permission (if any) | Action |
|---|---|---|
| `dash` | View Dashboard | reuse |
| `command-center` | — | new |
| `zen-ai-dashboard`, `alerts` | View Alert Analysis | reuse |
| `ai-benchmarks` | — | new |
| `exec` | Run CrewAI Analysis | reuse |
| `reports` | View SOC Reports / Export Reports | reuse |
| `mitre` | View MITRE ATT&CK | reuse |
| `actors` | View Threat Actors | reuse |
| `hunt` | View Threat Hunting | reuse |
| `assets` | — | new |
| `ueba-overview`, `ueba-entities`, `ueba-rules` | — | new (3) |
| `inbound`, `outbound` | Configure Integrations | reuse |
| `analysts` | Manage Analysts | reuse |
| `users` | Manage Users | reuse |
| `tenants` | — | new |
| `roles` | Manage Roles | reuse |
| `audit` | View Audit Log | reuse |
| `profile` | — | new (always allowed, self-service) |
| `sysmon` | View System Monitor | reuse |
| `settings` | View API Keys / Configure SMTP | reuse (tabbed, see below) |

## Backend components

- `backend/app/utils/auth.py` — add `require_permission(key: str)` factory dependency alongside the existing `verify_admin_token`/`verify_write_permission`; `ROLE_ADMIN` always passes.
- `backend/app/routers/*.py` — apply `Depends(require_permission("..."))` to the route(s) backing each page in the map above.
- `backend/app/database/managers/user_db_manager.py` — extend the seeded `ROLE_ADMIN`/`ROLE_DEMO`/`ROLE_VIEWER` templates with the new permission keys so existing users don't lose access on migration.

## Frontend components

- `frontend/src/features/common/Sidebar.jsx` — wrap every `<NavItem>` with a real `hasPermission(pageKey)` check (currently only one bogus check exists).
- `frontend/src/App.jsx` — reject `setActiveView()` to a view the user lacks permission for (defense in depth beyond hiding the nav item).
- New: `frontend/src/features/administration/AccessControlPage.jsx` — OpenUBA-styled matrix (rows = pages, columns = Read/Write toggles), one role selected at a time, Save button — talks to the same `/api/admin/roles` endpoints `RoleManagement.jsx` already uses.
- `frontend/src/features/system/Configuration.jsx` / wherever Settings lives — add "Access" as a tab alongside the existing API Keys / ML Models / System tabs, hosting the new matrix page.

## Phased rollout

- [x] **Phase 1 — Audit & schema.** Walked the real `Sidebar.jsx` (23 nav items, not the stale mental list) and matched each to an existing or new permission key. Added 8 new permission keys (`View Command Center`, `View Zen AI Dashboard`, `View AI Benchmarks`, `View Asset Management`, `View Behavior Overview`, `View Entity Risk`, `View Behavior Rules`, `View Tenant Matrix`) to `ALL_PERMISSIONS` in `RoleManagement.jsx`. **Real bug found**: the 3 seeded role templates (`ROLE_ADMIN`/`ROLE_DEMO`/`ROLE_VIEWER`) are inserted with `ON CONFLICT (name) DO NOTHING` — once a role exists in the DB, its permission list never gets updated by a code change, ever. Since enforcement didn't exist yet, this was invisible. Fixed with a grandfather migration in `user_db_manager.py`: on every startup, any existing role (built-in or custom) missing one of the 8 new keys gets it appended — additive, idempotent, prevents Phase 2/3 from silently locking non-admin users out of pages they could already reach.
- [x] **Phase 2 — Backend enforcement.** Added `require_permission(key)` to `utils/auth.py` (ROLE_ADMIN always bypasses, same convention as `verify_admin_token`). Wired it onto the 4 dedicated read routes that map 1:1 to a single page: `GET /api/assets`, `GET /api/assets/{id}/alerts`, `GET /api/ueba/overview`, `GET /api/ueba/entities`, `GET /api/ueba/entities/{id}`, `GET /api/ueba/rules`. **Deliberately left ungated**: `GET /api/admin/tenants` — confirmed via grep it's shared infrastructure (`TenantSwitcher.jsx`, header component every user sees, and `UserManagement.jsx`'s tenant-assignment field), not exclusive to the Tenant Matrix admin page; gating it would break the tenant switcher for non-admins. Its actual admin mutation (`PUT /tenants/{name}/status`) is already `verify_admin_token`-gated. Command Center / Zen AI Dashboard / AI Benchmarks have no dedicated backend route (composed from shared dashboard data) — not safe to gate at the API layer without a dedicated endpoint; covered by Phase 3's frontend gating instead. **Verified live**, not just by inspection: rebuilt and restarted the local `zen-backend` container (picked up a pre-existing unrelated bug too — a stray pasted terminal-prompt line in `.env` was breaking `docker compose build` entirely, removed it), logged in as the real admin account (bypass confirmed working), created a real throwaway role/user with only `View Dashboard`, confirmed `GET /api/assets` and all 3 UEBA routes returned 403 with the correct permission name in the error, granted `View Asset Management` to that same role, confirmed `/api/assets` flipped to 200 while UEBA routes (not granted) stayed 403, then deleted the test role/user.
- [x] **Phase 3 — Frontend enforcement.** Added a `PAGE_PERMISSIONS` map + `canSee()`/`seeAnyOf()` helpers in `Sidebar.jsx`, replacing the old `isStaff` gate (which only checked for the literal role-name substrings "ADMIN"/"DEMO"/"TEST", not any real permission). Every `<NavItem>` is now wrapped in a real `canSee(pageKey)` check; section headers (Data Pipelines, Administration, Threat Intelligence, etc.) only render if at least one child in them is visible, so a restricted role doesn't see an empty section label. `profile` intentionally has no permission requirement — always visible, self-service. No visual/theme changes — same `var(--...)` tokens, same layout, purely conditional rendering. Verified the file still compiles clean through Vite's actual dev-server transform pipeline (not just a standalone syntax check) — couldn't visually click through it in a real browser in this environment (no browser automation tool available here), noting that limitation rather than claiming a visual check that didn't happen.
- [x] **Phase 4 — Access matrix UI.** Extracted the page↔permission map to a shared `frontend/src/constants/pagePermissions.js` (`PAGE_ACCESS_MAP`/`PAGE_PERMISSIONS`) so `Sidebar.jsx`'s enforcement and the new matrix UI can't drift apart — `Sidebar.jsx` now imports it instead of defining its own copy. Built `AccessControlPage.jsx`: role picker, one row per sidebar page grouped by section, a toggle per row, Save button — same visual language as `RoleManagement.jsx` (`var(--bg-card)`, `var(--border-color)`, `var(--text-primary)`, same table/toggle styling), no new palette introduced. Wired into `Configuration.jsx` (SecureZen's actual Settings page) as a 4th tab, "Access," visible only to `isAdmin` or holders of "Manage Roles" — same privilege bar as Role Management itself.

  One deliberate design call: OpenUBA's matrix has Read *and* Write columns per page; SecureZen's permission model only has real per-page **view** enforcement today (write actions are gated coarser, by `verify_admin_token`, not a matching "Edit X" permission per page). Building a Write column that didn't actually do anything would be a fake control, so this matrix has a single "Access" toggle per page — it's honest about what's actually enforced. A real Read/Write split is a future extension once per-page write permissions exist, not before.

  Also handles a real subtlety: the matrix only represents *page-visibility* permissions. A role's other permissions (`Export Reports`, `Configure SMTP`, `View ZEN Chatbot`, etc. — action-level, not page-level) live outside the matrix. Saving computes `finalPerms = (role's existing non-page permissions) + (currently-checked page permissions)`, so the Access tab can't accidentally wipe out action-level grants it doesn't display.

  **Verified live end-to-end**, not just by inspection: compiled all 3 changed files through Vite's actual dev-server transform pipeline (real HTTP 200s, not just a standalone esbuild check). Then, against the real running backend: created a throwaway role with a mixed page + non-page permission (`View Dashboard` + `Export Reports`), replayed the exact save logic `AccessControlPage.jsx` runs (uncheck `View Dashboard`, check `View Asset Management`, keep `Export Reports`) as a direct API call, confirmed the role ended up with exactly `["Export Reports", "View Asset Management"]` — proving the non-page permission survives and the page swap applies correctly. Created a real user under that role, logged in as them, confirmed `GET /api/assets` → 200 and `GET /api/ueba/overview` → 403, matching the just-saved permission state exactly. Cleaned up both test accounts afterward.
- [x] **Phase 5.1 — Real bug found on the actual browser test.** User clicked Save in the new Access tab on 198 and got `400 Bad Request`. Root cause: `save_role()` had a blanket `if is_template: raise ValueError("Cannot modify system template roles")` - and all 3 roles that actually exist (`ROLE_ADMIN`/`ROLE_DEMO`/`ROLE_VIEWER`) are templates. This wasn't a bug in the Access tab - it was a **pre-existing landmine in Role Management itself** that nobody had hit before, because the existing dual-list-swapper's Edit button was never actually usable on any of the 3 shipped roles either (its UI never disabled Edit for templates, only Delete - so the bug was there, just unexercised). Fixed by changing the guard: `ROLE_ADMIN` specifically stays fully locked (editing its permissions would be pointless anyway - it bypasses checks by role name, not by its permission list), but `ROLE_DEMO`/`ROLE_VIEWER`/future templates can now have their description and permissions edited - only *renaming* a template is still blocked. Also added matching frontend guards (both `RoleManagement.jsx`'s Edit button and `AccessControlPage.jsx`'s toggles/Save are now disabled with an explanatory note when `ROLE_ADMIN` is selected, instead of letting the user attempt it and hit a 400). Verified live: `ROLE_ADMIN` edit attempt now returns a clean explanatory 400, `ROLE_VIEWER` edit now succeeds and persists.

  Also fixed a real, separate latent bug found while investigating: `useAdmin.js`'s `updateUser`/`toggleUserStatus`/`deleteUserPermanent` interpolated the raw email into the URL path without `encodeURIComponent()`. Traced `delete_user_permanent()` and `get_all_users()` end-to-end and both are structurally correct (plain unconditional `DELETE`, no cache, no stale read path) - re-verified live by creating and permanently deleting 2 real test users during this session's own testing, both vanished immediately. Couldn't reproduce a delete-not-syncing symptom through static analysis or live testing, so the URL-encoding fix is applied as a genuine defensive fix, not a confirmed root cause - **still waiting on the exact symptom** (error toast text? does the user reappear after refresh? deleted from Users but still shows in Tactical Operators/Analysts?) to close this one out for real.

- [ ] **Phase 5 — End-to-end verification.** Real browser click-through once available (sidebar hides pages, blocked pages actually redirect/block on direct URL-ish view-switch attempts, Access tab renders and saves correctly on screen). No browser automation tool exists in this environment, so this phase is explicitly still open rather than claimed — everything verified so far was via direct API calls and Vite's transform pipeline, not an actual rendered page. Document actual findings here same as the other phases once it happens.

Once this is done and confirmed working, the AI SOC repo (to be shared) gets evaluated as an additional layer on top of this same permission model — not before.
