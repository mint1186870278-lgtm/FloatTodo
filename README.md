# FloatTodo

A Lightweight Windows Desktop Todo App with AI Agent Integration

[简体中文](README.zh-CN.md)

FloatTodo is a local-first Windows floating desktop todo app. Everyday task management works offline without an account. AI agents can add tasks through a local command-line interface; optional Todoist synchronization provides a separate cloud workflow.

**V1.3.1 source is publicly available. Windows Portable / Setup binaries have not been publicly released.** The license is PolyForm Noncommercial License 1.0.0; copyright is held by Peiying Ma (2026). This is source-available software, not OSI-approved open source.

## Features

- Draggable floating ball, hover expansion, tray recovery and compact task panel.
- Pin / Always on Top, automatic background opacity and keyboard interactions.
- Task groups, notes, due dates and To-do / Pending / Completed / Cancelled states.
- Whole-row drag reorder within the same To-do group; order survives restart and stays local during sync.
- Atomic local persistence, JSON export/import, automatic backups and local CLI receipts.
- Optional Todoist account connection, project selection, preview/confirmation, incremental synchronization and conflict handling.

## Screenshots

No screenshots are included yet. Reviewed screenshots from a fresh, synthetic-data profile may be added here. Do not use account screens, personal tasks or recording captures without review.

## Installation and Windows support

V1.3.1 source is available in this public repository. Windows Portable / Setup binaries have not been publicly released, and no public binary download link is available. Existing private binaries are not included. When a binary release is approved, its installation instructions and SHA256 checksums should accompany the download.

Planned distributions are Windows x64 Portable and Setup. Portable extracts its runtime to a temporary location; it does not carry task data beside the EXE. Both editions share the same Windows-user data directory. Exit the old version through the tray and export a backup before upgrading.

Historical verification used Windows 10 build 18362 x64 at 250% DPI. Windows 11, other scaling settings and multiple-monitor changes are not fully verified. Setup was built, but actual installation/uninstallation remains unverified. Existing candidate executables are unsigned and may trigger unknown-publisher or SmartScreen prompts. Verify origin and SHA256; do not disable Windows protection.

## Develop and build locally

Use Windows PowerShell with Node.js and npm. Historical tooling used Node 24.21.0 and npm 11.19.0; dependency versions remain pinned in package-lock.json. No dependency versions were changed for this preparation.

```powershell
npm ci
# Isolate development from your everyday FloatTodo profile.
$env:FLOATTODO_DATA_DIR = "$PWD\artifacts\dev-profile"
npm run dev
# Exit the development application before packaging.
npm run typecheck
npm run build
npm run dist:win
```

Packaging creates Portable and Setup artifacts under `release/v1.3.1/`. It may download build tools and does not sign executables. Source-only preparation did not install dependencies or rebuild these artifacts. Keep Electron sandboxing and TLS certificate verification enabled.

For CLI commands from another terminal, set FLOATTODO_DATA_DIR to the same profile used by the app. A custom directory is a separate profile, not an automatic migration.

## AI agent integration

Agents use the local Node CLI; there is no built-in LLM request, API server, ChatGPT connector or MCP server. Keep the desktop app running to consume queued commands:

```powershell
npm run todo -- add --title "Review the weekly plan" --category work --command-id weekly-plan-001 --wait 8000
npm run todo -- list
npm run todo -- status --command-id weekly-plan-001
```

A queued command is not an applied task. Check the receipt; a wait timeout leaves the command queued. Reuse the same command ID when retrying the same logical operation. CLI commands also support update, complete and move; run `node cli/todo.cjs help` for usage. Grant an agent permission to change tasks deliberately; local task files and CLI access are not a remote authorization boundary.

## Optional Todoist sync

Connect only from the local settings UI using your own personal API token. Never put a token in an issue, command example or chat. Credentials use Electron safeStorage; unavailable encryption blocks saving rather than falling back to plaintext.

Select the intended project by ID, review its preview and explicitly approve imports/uploads. Switching projects is blocked while commands remain unsettled; old local tasks are excluded from automatic upload into the new project. Manual row order remains local. Automatic sync checks approximately every 45 seconds and respects retry backoff; it is not instant delivery.

The previous private acceptance report records a successful Demo-project selection/restart and cloud workflow. Comprehensive cloud recovery, all conflict cases and all network conditions are not verified. A ChatGPT-to-Todoist-to-FloatTodo workflow requires separate external integrations and authorization; FloatTodo does not connect directly to ChatGPT.

## Data and backups

The default profile is `%APPDATA%\FloatTodo-v1.2`, also used by the CLI. It contains task JSON, backups, queue receipts, session files and a separately encrypted Todoist credential. Tasks and exported JSON are plaintext and can contain private information. Keep this directory and exports out of repositories and public support attachments.

Use Settings to export JSON before upgrades. Import replaces current tasks after confirmation and creates a backup; it clears sync write authorization/associations rather than trusting imported cloud links. Automatic `.bak` recovery can restore an earlier revision. Do not assume an uninstaller preserves or deletes your data.

## Tests and limitations

See [testing](docs/TESTING.md) for isolated test commands. Prior private records contain 97/97 unit tests and 34 passed / 1 skipped E2E checks; these are historical results, not newly run CI. This preparation uses syntax, reference and no-emit type checks and does not repeat GUI, install or cloud tests.

Same-group To-do reorder is supported; cross-group/cross-status drag is not. No automatic online update is provided. Dependency advisory status was not refreshed during preparation. Do not treat earlier dependency audits as a current vulnerability-free guarantee.

## License and third-party software

**License:** [PolyForm Noncommercial License 1.0.0](LICENSE), SPDX: PolyForm-Noncommercial-1.0.0.

**Commercial use:** Requires separate prior written authorization when not permitted by the standard license. See [commercial licensing](COMMERCIAL_LICENSE.md).

The standard license permits noncommercial purposes and its specified personal and organizational uses. Its provisions for charitable organizations, educational institutions, public research organizations, public safety or health organizations, environmental protection organizations and government institutions remain unchanged, regardless of funding source or resulting obligations. This summary adds no restrictions and does not limit fair-use rights. Distributors must provide the license terms or their URL and preserve any licensor-provided Required Notice lines.

Copyright 2026 Peiying Ma. See [NOTICE.md](NOTICE.md) for the Required Notice and original-project scope. Public source availability does not grant separate commercial authorization.

Third-party software retains its own licenses. See [third-party notices](THIRD_PARTY_NOTICES.md) and [bundled JS notices](assets/THIRD_PARTY_LICENSES.txt). Third-party permissions do not license FloatTodo's own source.

## Contributions and feedback

See [contribution guidance](CONTRIBUTING.md) and the [public repository](https://github.com/mint1186870278-lgtm/FloatTodo). For feedback, provide only synthetic-data reproduction steps and redacted errors, never tokens, task databases or backups.
