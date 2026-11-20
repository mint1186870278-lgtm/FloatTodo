# Isolated verification

Run commands from the project root after installing the pinned dependencies. Use Windows for native GUI tests. Never point tests at an everyday profile or supply a real Todoist token.

```powershell
npm run typecheck
npm test
```

Unit tests create synthetic profiles under artifacts/test-data; Todoist tests use FakeTodoist or mocked fetch and credentials. They do not need a real account. Test output is ignored and is not source material.

Optional GUI checks require a local build and a desktop session:

```powershell
npm run build
New-Item -ItemType Directory -Force artifacts/test-data, artifacts/ui-validation | Out-Null
npm run test:e2e
npx playwright test --config playwright.v130.config.cjs
npx playwright test --config playwright.v131.config.cjs
```

The copied GUI tests set isolated FLOATTODO_DATA_DIR profiles. Native tests move the Windows pointer/focus and may capture the desktop; run only in a controlled session without private windows. The optional Chrome acceptance case is excluded by the default configuration. The V1 source-migration comparison is explicitly skipped because historical source snapshots are excluded. A historical V1.1.0 binary comparison skips when its excluded binary is absent; its optional branch also uses Python/Pillow. Never use these tests to claim unverified platforms passed.

The complete previous private run recorded 97/97 unit tests and 34 passed / 1 skipped E2E checks. This preparation does not rerun those suites, GUI, installation or cloud workflows. Do not confuse historical results with current CI or a reproducible-build claim.
