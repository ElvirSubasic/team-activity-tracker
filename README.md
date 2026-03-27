# Team Activity Tracker

Team Activity Tracker is an offline-first Electron desktop application for managing people, logging team activities, calculating deterministic scores, versioning scoring rules, exporting reports, and reviewing dashboard analytics.

This document is intended as a practical project wiki for future maintenance.

---

## 1. Purpose

The application solves four main problems:

1. Track team/member activity in a structured way.
2. Convert those activities into points using configurable scoring rules.
3. Preserve historical scoring behavior through immutable score configuration versions.
4. Provide auditability, exports, and dashboard reporting from local data.

It is designed for scenarios such as:

- class team marketing work
- campaign contribution tracking
- structured team evaluation
- internal productivity scoring

---

## 2. Product Summary

Main product areas:

- Settings / scoring configuration management
- Persons management
- Activity log workflow
- Team dashboard and reports
- Export / backup / restore

Important product rules:

- data is stored locally in SQLite
- one active score config version exists at a time
- score config versions are treated as snapshots
- historical logs can optionally be remapped to a new active version
- score calculations are deterministic and stored per log item

---

## 3. Technology Stack

- Electron 41
- React 18
- TypeScript
- Vite 5
- SQLite via `better-sqlite3`
- Vitest
- ESLint
- Electron Builder

Project style:

- renderer = React UI only
- preload = typed bridge only
- main process = privileged desktop/runtime logic
- repositories = SQL access
- services = validation, normalization, scoring, orchestration

---

## 4. Project Structure

### Root

- [index.html](index.html) — renderer HTML shell
- [package.json](package.json) — scripts, dependencies, packaging config
- [README.md](README.md) — this documentation
- [tsconfig.json](tsconfig.json) — renderer TS config
- [vite.config.ts](vite.config.ts) — Vite config

### Electron source

- [electron/main.ts](electron/main.ts) — app startup, BrowserWindow, backup/export dialogs, share handling
- [electron/ipc.ts](electron/ipc.ts) — IPC registration layer
- [electron/preload.ts](electron/preload.ts) — `window.desktop` bridge
- [electron/types.ts](electron/types.ts) — backend/shared domain types
- [electron/db/client.ts](electron/db/client.ts) — database connection bootstrap
- [electron/db/schema.ts](electron/db/schema.ts) — migrations/schema definitions
- [electron/repositories](electron/repositories) — SQL repositories
- [electron/services](electron/services) — business logic services

### Renderer source

- [src/App.tsx](src/App.tsx) — top-level shell, routing, theme switch, page layout
- [src/main.tsx](src/main.tsx) — React entry point
- [src/styles.css](src/styles.css) — global styles
- [src/types.ts](src/types.ts) — renderer/shared app types
- [src/preload.d.ts](src/preload.d.ts) — typed `window.desktop` declarations
- [src/components](src/components) — UI modules

### Build output

- `dist/` — renderer production build + packaged artifacts
- `dist-electron/` — compiled Electron TypeScript output

### Local data

- `data/` is treated as a local-only folder and is intentionally ignored by Git
- keep private datasets, exports, or sample scoring files there if needed
- do not rely on `data/` for packaged app runtime behavior

---

## 5. Architecture Overview

### 5.1 Renderer

The renderer is responsible for:

- forms and workflows
- tables, cards, filters, pagination
- charts and dashboard visualization
- displaying success/error feedback
- calling the preload API

The renderer does **not** directly access:

- SQLite
- filesystem
- shell / external links
- clipboard privileged APIs

Those are delegated through the preload bridge and main process.

### 5.2 Preload Bridge

The preload layer exposes `window.desktop`.

Major sections include:

- `person`
- `scoreConfig`
- `activity`
- `teamDashboard`
- `report`
- `backup`
- `share`

Files:

- [electron/preload.ts](electron/preload.ts)
- [src/preload.d.ts](src/preload.d.ts)

### 5.3 Main Process

The main process is responsible for:

- creating the Electron window
- starting the app window maximized for full-screen workflow by default
- initializing the database
- wiring IPC handlers
- file open/save dialogs
- backup and restore
- export/import file operations
- opening WhatsApp share URLs
- clipboard writes

File:

- [electron/main.ts](electron/main.ts)

### 5.4 Repositories

Repositories are thin database access layers.

Examples:

- `PersonRepository`
- `ActivityRepository`
- `ScoreConfigRepository`
- `AuditRepository`
- legacy transaction/category repositories from earlier scaffold

They should contain SQL, not UI logic.

### 5.5 Services

Services enforce business rules.

Main service:

- `TeamActivityService`

Responsibilities:

- validation
- normalization
- score calculation
- remapping historical logs
- exports
- reporting
- audit logging

File:

- [electron/services/teamActivityService.ts](electron/services/teamActivityService.ts)

---

## 6. Database Model

Schema is created and migrated in [electron/db/schema.ts](electron/db/schema.ts).

Important tables:

### `persons`

Stores team members.

Fields include:

- `index_num`
- `name`
- `role`
- `phone_number`
- `is_active`

### `score_config_versions`

Stores immutable scoring snapshots.

Fields include:

- `name`
- `is_active`
- `created_at`
- `activated_at`
- `notes`

Rule:

- exactly one active version is allowed

### `activity_groups`

Top-level scoring groups within a config version.

Examples:

- Padlet
- Instagram
- Presentation Activities

### `activity_types`

Activities within a group.

Supports:

- `percent_of_group_base`
- `fixed_points`
- `parent_activity_type_id`
- `percent_of_parent_type`

This enables one-level subgrouping.

Example:

- top-level activity: `PRESENTATION_SKILLS_BASED`
- subgroup activity: `PRESENTATION_SKILL_4`

### `activity_logs`

Top-level log header per person/date/group.

### `activity_log_items`

Items inside a log.

Each item points to an `activity_type_id` and quantity.

### `activity_log_item_scores`

Stores computed score snapshots.

This is important because it makes reporting deterministic and auditable.

### `audit_events`

Stores audit history of administrative and scoring actions.

### `schema_migrations`

Tracks applied schema migrations.

---

## 7. Scoring Model

Three scoring styles are supported.

### 7.1 Fixed points

$$
	ext{points per unit} = \text{fixed points}
$$

$$
	ext{total points} = \text{quantity} \times \text{fixed points}
$$

### 7.2 Percent of group base

$$
	ext{points per unit} = \frac{\text{group base points} \times \text{percent of group base}}{100}
$$

### 7.3 Percent of parent activity

For one-level subgroup activities:

$$
	ext{parent points per unit} = \frac{\text{group base points} \times \text{parent percent}}{100}
$$

$$
	ext{child points per unit} = \frac{\text{parent points per unit} \times \text{child percent of parent}}{100}
$$

Example:

- group base points = 100
- `Presentation Skills Based` = 10% of group = 10 points
- `Presentation Skill 4` = 80% of parent = 8 points

### 7.4 Quantity

Once a points-per-unit value is determined:

$$
	ext{total points} = \text{quantity} \times \text{points per unit}
$$

### 7.5 Rounding

Scores are rounded consistently in service code using `roundScore()`.

---

## 8. Score Configuration Versioning

The scoring configuration is versioned intentionally.

Rules:

- changing scoring creates a new version
- previous versions remain immutable snapshots
- one version is active at a time
- deleting an active or historically used version is blocked

Supported operations:

- create new version
- activate version
- deactivate version (with fallback activation)
- delete unused inactive version
- export JSON
- import JSON

Files involved:

- [src/components/ScoreConfigAdmin.tsx](src/components/ScoreConfigAdmin.tsx)
- [electron/services/teamActivityService.ts](electron/services/teamActivityService.ts)
- [electron/repositories/scoreConfigRepository.ts](electron/repositories/scoreConfigRepository.ts)

---

## 9. Historical Recalculation Behavior

When a new score config is created, there are two separate concepts:

### Activate only

- future operations use the new active version
- old logs remain as they were
- dashboard continues to reflect stored historical scores for old data

### Activate and apply to historical logs

If `Apply To Historical Logs = Yes` during save:

1. old log groups are remapped by matching group code
2. old log activity types are remapped by matching activity code
3. score snapshots are recalculated against the new version
4. dashboard reflects the recalculated history

This process is explicit and audited.

---

## 10. UI Modules

### 10.1 Settings

Main file:

- [src/components/ScoreConfigAdmin.tsx](src/components/ScoreConfigAdmin.tsx)

Capabilities:

- create new score version from scratch or copied snapshot
- manage groups and activities
- configure subgroup parent relationships
- activate a version after save
- optionally apply to historical logs
- export/import JSON
- share change summaries

### 10.2 Persons

Main file:

- [src/components/PersonsManager.tsx](src/components/PersonsManager.tsx)

Capabilities:

- create/update/delete persons
- activate/deactivate persons
- CSV import/export
- transparency drill-down

### 10.3 Activity Log Workflow

Main file:

- [src/components/ActivityLogWorkflow.tsx](src/components/ActivityLogWorkflow.tsx)

Capabilities:

- choose person, group, date, notes
- choose top-level activity or subgroup subtype
- duplicate previous log
- score preview
- batch mode
- single/batch save validations before submit (required group/person/items)
- edit and delete logs
- view selected log line-item details with quantity and points breakdown
- show activity type summary directly in the logs list
- truncate long activity-type summaries in list rows for readability (full details remain available via View)
- backdate logs using activity date override
- keyboard helpers documented in UI tooltip (Enter to append row, Ctrl+Enter to save)

Important note:

- the activity date represents when the activity happened, not when it was entered

### 10.4 Dashboard

Main file:

- [src/components/TeamDashboardReports.tsx](src/components/TeamDashboardReports.tsx)

Capabilities:

- KPI cards
- leaderboard table + bar chart
- contribution distribution table + pie chart
- weekly activity volume table + bar chart
- inactive members table
- leaderboard sharing

### 10.5 Export / Backup / Restore

Files:

- [src/components/ReportExportCenter.tsx](src/components/ReportExportCenter.tsx)
- [src/components/BackupRestorePanel.tsx](src/components/BackupRestorePanel.tsx)

---

## 11. JSON Score Config Format

The project supports JSON import/export of scoring versions.

Top-level structure:

```json
{
  "version": {
    "name": "Marketing Semester v1",
    "notes": "..."
  },
  "groups": [
    {
      "code": "PRESENTATION_ACTIVITIES",
      "name": "Presentation Activities",
      "baseXp": 100,
      "activities": [
        {
          "code": "PRESENTATION_SKILLS_BASED",
          "name": "Presentation Skills Based",
          "percent": 10,
          "subActivities": [
            { "code": "PRESENTATION_SKILL_1", "name": "Presentation Skill 1", "percent": 20 },
            { "code": "PRESENTATION_SKILL_4", "name": "Presentation Skill 4", "percent": 80 }
          ]
        }
      ]
    }
  ]
}
```

Interpretation:

- `percent` on a top-level activity = percent of group base
- `percent` on a `subActivities` item = percent of parent activity

---

## 12. Commands

All commands come from [package.json](package.json).

### 12.1 Install

- `npm install`

### 12.2 Development

- `npm run dev`

Starts:

- Vite renderer dev server
- Electron main process in dev mode

### 12.3 Build

- `npm run build`

Equivalent to:

- `npm run build:renderer`
- `npm run build:electron`

### 12.4 Renderer only

- `npm run build:renderer`

### 12.5 Electron only

- `npm run build:electron`

### 12.6 Lint

- `npm run lint`

### 12.7 Tests

- `npm test`

This also rebuilds the native SQLite dependency for Node test runtime.

### 12.8 Native module rebuilds

- `npm run rebuild:native:node`
- `npm run rebuild:native:electron`

Use when SQLite native binding compatibility becomes an issue.

### 12.9 Package all configured targets

- `npm run package`

### 12.10 Package Linux AppImage

- `npm run package:linux`

Expected artifact:

- `dist/team-activity-tracker-0.1.4-linux-x86_64.AppImage`

### 12.11 Package Windows executable

- `npm run package:win`

Expected artifact:

- `dist/team-activity-tracker-0.1.4-windows-x64.exe`

---

## 13. Typical Maintenance Tasks

### 13.1 Add a new dashboard metric

Usually update:

- repository query in [electron/repositories/activityRepository.ts](electron/repositories/activityRepository.ts)
- service method in [electron/services/teamActivityService.ts](electron/services/teamActivityService.ts)
- type definitions in [electron/types.ts](electron/types.ts) and [src/types.ts](src/types.ts)
- IPC/preload if needed
- renderer UI component

### 13.2 Add a new export

Usually update:

- service export method
- main-process save dialog handler
- preload bridge
- renderer button and status handling

### 13.3 Change scoring logic

Review carefully:

- [electron/services/teamActivityService.ts](electron/services/teamActivityService.ts)
- subgroup logic in `computePointsPerUnitForType()`
- remap/recalculation flows
- tests

### 13.4 Modify schema

Add a new migration in [electron/db/schema.ts](electron/db/schema.ts).

Rules:

- never rewrite already shipped migrations
- add a new incrementing migration id
- make migration idempotent where possible

---

## 14. Release Process

Recommended release checklist:

1. Run lint
   - `npm run lint`
2. Run tests
   - `npm test`
3. Run production build
   - `npm run build`
4. Package target
   - `npm run package:linux`
  - `npm run package:win`
5. Open the packaged app and smoke test:
   - scoring settings
   - subgroup selection
   - activity creation/editing
   - dashboard
   - exports
   - backup/restore

### 14.1 Automated GitHub release (GitHub Actions)

This project uses a tag-triggered release workflow.

Steps:

1. Ensure `main` is up to date and clean
  - `git checkout main`
  - `git pull`
  - `git status`
2. Bump application version
  - `npm version 0.1.8 --no-git-tag-version`
3. Commit and push version changes
  - `git add package.json package-lock.json`
  - `git commit -m "chore: bump version to v0.1.8"`
  - `git push origin main`
4. Create and push a matching version tag
  - `git tag v0.1.8`
  - `git push origin v0.1.8`
5. GitHub Actions builds Linux + Windows artifacts and publishes/updates the release automatically.

Notes:

- release workflow file: [.github/workflows/release.yml](.github/workflows/release.yml)
- workflow runs are visible in GitHub Actions
- if a tag was created by mistake, delete it locally and remotely:
  - `git tag -d v0.1.8`
  - `git push origin :refs/tags/v0.1.8`

---

## 15. Linux Packaging Notes

Current packaging configuration is in [package.json](package.json).

Observed non-blocking packaging warnings may include:

- missing `author`
- default Linux category
- default Electron icon

These do not block packaging, but can be improved later.

---

## 16. Troubleshooting

### 16.1 AppImage not found after packaging

Possible causes:

- packaging ran from a different linked path
- build finished only renderer output
- symlinked workspace path confusion

Check:

- `dist/`
- current working directory
- whether `package:linux` actually completed

### 16.2 Native SQLite issues

If Electron runtime cannot load `better-sqlite3`:

- run `npm run rebuild:native:electron`

If tests fail due to native binding mismatch:

- run `npm run rebuild:native:node`

### 16.3 Historical recalculation not reflected

Confirm that the new version was saved with:

- `Activate After Save = Yes`
- `Apply To Historical Logs = Yes`

Otherwise history stays on previous computed snapshots.

### 16.4 Subgroup option not appearing in Activity Log

Check that:

- the child activity has a parent activity configured
- parent and child are in the same group
- active version is the expected version
- log group matches the group containing those activities

### 16.5 Dashboard looks wrong after scoring changes

Most likely reasons:

- new version was activated but not applied historically
- old logs still use previous score snapshots
- date filters are narrowing the report

---

## 17. Security Model

Basic security posture:

- `contextIsolation: true`
- `nodeIntegration: false`
- renderer receives only explicit bridge APIs
- OS integrations happen in main process

This is why share and clipboard actions are handled outside the renderer.

---

## 18. Auditability

Administrative actions are logged in `audit_events`, including examples like:

- score config version creation
- activation/deactivation
- historical apply/recalculation
- person import
- activity scoring recalculation

This is useful when diagnosing changes in totals.

---

## 19. Known Design Decisions

- score config versions are snapshot-based instead of in-place editable
- only one subgroup nesting level is supported
- deterministic scores are stored, not recalculated on every render
- dashboard includes both tables and visual charts
- help text is shown via hover/focus popups rather than long inline explanations

---

## 20. Suggested Future Improvements

Possible future work:

- custom app icon
- author/category metadata in package config
- richer charting library instead of CSS-based charts
- stronger migration safeguards for old live databases
- more automated release workflow
- explicit admin screen for recalculation operations
- more tests for subgroup remapping/history migration

---

## 21. Quick Mental Model

If maintaining this project later, the simplest mental model is:

1. people perform activities
2. activities map to score config activity types
3. activity types belong to groups
4. groups belong to a score config version
5. each saved item gets a stored score snapshot
6. dashboard/reporting reads those stored results
7. new scoring rules only affect history if explicitly applied

---

## 22. Key Files to Read First

If returning to the project later, start with these:

1. [package.json](package.json)
2. [electron/main.ts](electron/main.ts)
3. [electron/db/schema.ts](electron/db/schema.ts)
4. [electron/services/teamActivityService.ts](electron/services/teamActivityService.ts)
5. [src/App.tsx](src/App.tsx)
6. [src/components/ScoreConfigAdmin.tsx](src/components/ScoreConfigAdmin.tsx)
7. [src/components/ActivityLogWorkflow.tsx](src/components/ActivityLogWorkflow.tsx)
8. [src/components/TeamDashboardReports.tsx](src/components/TeamDashboardReports.tsx)

Those files explain most of the system.

## Backup and restore

Local database backup and restore remain available.

- backup exports the SQLite database file
- restore replaces the active local database
- restore should only be used with trusted files

## Security defaults

- `contextIsolation: true`
- `nodeIntegration: false`
- preload bridge only
- database operations isolated to the main process

## Quality safeguards

- service tests cover scoring, recalculation, exports, dashboards, and sharing message builders
- renderer uses a global error boundary
- feedback notices use a shared presentation style
- pagination defaults to `10` in operational team activity flows

## Troubleshooting

### App builds but Electron window shows errors

- run `npm test`
- run `npm run build`
- verify preload and renderer types are in sync

### SQLite constraint errors

- duplicate names or codes will fail validation
- only one active score config version is allowed
- deleting referenced records can be blocked by foreign keys

### Historical scores changed unexpectedly

- check whether a new config version was explicitly applied to historical logs
- review `audit_events` for recalculation and version actions

### WhatsApp sharing does not open

- verify the desktop environment allows opening external URLs
- use the copy-to-clipboard fallback

### Linux AppImage opens blank or exits immediately

- avoid running/building the project from a path that contains spaces
- native module rebuilds (for example `better-sqlite3`) can fail with spaced paths and cause startup failure
- preferred Linux path style: `~/projects/team-activity-tracker` or `~/projects/team_activity_tracker`
- after moving to a no-space path, run:
  - `npm install`
  - `npx electron-builder install-app-deps`
  - `npx electron-builder --linux AppImage`

### Portable Windows build not produced

- ensure packaging is run on a compatible environment for Windows output
- confirm Electron Builder dependencies are installed
- review the Windows target configuration in [package.json](package.json)
