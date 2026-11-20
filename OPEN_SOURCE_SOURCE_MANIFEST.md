# Source-Available Source Manifest

Source version: **1.3.1 working-tree snapshot**.
Original private archive HEAD: e760fb69ec70c75bb815494f44aef08e34c2be30 (version 1.2.1).
This snapshot is prepared for the first independent local V1.3.1 source commit. No original Git objects, refs or history were copied. Its own commit SHA is intentionally not embedded in this file; Git history identifies the commit without a self-referential follow-up.

## Snapshot and scope

The original working tree was dirty: 15 tracked modifications and 253 untracked files at preparation preflight. Only explicit reviewed paths were copied. Original source files, Git index and Git status are checked for preservation; detailed receipts stay outside this candidate.

Copied source/config/test/asset paths: 55. All src/, electron/ and cli/ members match the source bytes. Licensing preparation changes only metadata and public documentation: package.json and lockfile root declare PolyForm-Noncommercial-1.0.0; package.json author is Peiying Ma. Production code is unchanged.
Only tests/e2e/refinement.spec.cjs differs: the V1 migration comparison requiring an excluded historical model is explicitly skipped. No production code, UI, data model or sync behavior changed.

Excluded: Git history/checkpoints, historical snapshots, reference media/archives, recording captures, internal reports, real profiles and backups, credentials/environment secrets, dependencies, generated dist, release binaries, downloads, test outputs and caches.

## Release mapping

The pre-existing 1.3.1 unpacked app.asar has 99 members. Ten Electron files and three assets match this candidate byte-for-byte. Three compiled dist resources match the existing project dist files; generated files are not copied here. Packaged name/version/main/dependencies match. Scripts, build configuration and devDependencies are omitted in the existing packaged manifest. Phase 3 adds only the license field to the source package manifest and lockfile root; the existing binary manifests have not been changed or relicensed by this preparation. Those binary files must not be advertised as carrying the new metadata.

| Existing private binary | Bytes | SHA256 |
| --- | ---: | --- |
| FloatTodo-1.3.1-Portable-x64.exe | 110567323 | bcf623a5e2625677527458cf7a0284d42fabf351f3febac8d221c9a522f18b08 |
| FloatTodo-1.3.1-Setup-x64.exe | 122001915 | 1093a2f19923823298f2b7142c693a49b02f310d05bfae0bc6ab590230773776 |

Both hashes match the existing acceptance record. No EXE or ZIP is included or published. Existing EXEs are unsigned. This links candidate runtime files to an existing unpacked ASAR and previously accepted binary hashes; the EXEs were not freshly unpacked during preparation.

**NOT VERIFIED:** rebuilding TypeScript to identical compiled output, deterministic/reproducible builds, actual Setup install/uninstall and comprehensive real-account sync. Static no-emit type checking is not a build.

## Licensing preparation

Source Available Software under [PolyForm Noncommercial License 1.0.0](LICENSE), SPDX PolyForm-Noncommercial-1.0.0. See [commercial licensing](COMMERCIAL_LICENSE.md). The official standard body is unmodified; its permitted institutional uses remain in effect. Copyright 2026 Peiying Ma. The formal project Required Notice and original-project scope are in [NOTICE.md](NOTICE.md). The first local commit is authorized; remote publication has not been authorized or executed. Third-party permissions remain separate. This is not an OSI-approved open-source claim.

## Validation

36 JS syntax checks, 54 relative import/require references and a TypeScript no-emit compiler check passed using already installed pinned dependencies read-only. No dependencies were copied into this candidate or installed. Existing 97/97 unit and 34 PASS / 1 SKIP E2E records are historical only. The candidate has an additional explicit historical-source comparison skip; its E2E suite was not rerun.

## Public candidate inventory

Version: V1.3.1. Total public files: 66. The complete list follows. SHA256 is computed from exact source-file bytes; this manifest omits its own hash to avoid self-reference. Git administrative metadata is excluded. No internal review materials are included.

| Candidate path | SHA256 |
| --- | --- |
| .gitignore | ac2e9e679dc9e1b8d0d5eda523cf9e859eb3b8382bbba9f73614a05fb7e4bf7a |
| assets/icon.ico | 3a4bd94546bae02c21558220bc5337a2299d9338533ac55f899fb1500458f959 |
| assets/icon.png | 645c4c794dfab2d4cc1ffce8f7ea55fa5b54d420d9bdcbcf1899938f87b4a479 |
| assets/THIRD_PARTY_LICENSES.txt | 884574c919035d5a835e238a8c8b2f5bc32953be321991ac5b89cc7cb4d58abc |
| cli/todo.cjs | 372a9695db2f5238fb3b83c39ea633b0f05b53de20d6e9c21da8c494e98df6bf |
| COMMERCIAL_LICENSE.md | 7cbfc0d32fecd2acaf182ed09fa021db29c6aca49fe69de5a62dae88ad0ac050 |
| CONTRIBUTING.md | 26c9edcf8ed47799ba5dd1c01d400e7d6aa021ecb519b0aa4d4dc46b7e5c4ea9 |
| docs/RELEASE_NOTES_1.3.1.md | c2765bd4471a6c52684b041bb3dfded8cc45b9a31b2821a2fb37935b5410c549 |
| docs/TESTING.md | 950b6d8ae69d2a840104418dd9c4d9ec25892b82a129502a1968382477b8f0ae |
| electron/credential-store.cjs | 52d02c1caa34c3926b15f1758d8c59b66c16b91beaa5c39931e1aed1f46faba9 |
| electron/interaction-state.cjs | 0661a69d9fec737188e17d50c308d974b4c55201734a0e8f0d19ef9cb86400e8 |
| electron/main.cjs | 001004f90fc6b51742f740a77f6088403fbb17ceaf3df65534ee1433a3170ef2 |
| electron/model.cjs | c67f300989c2d4542534fe9f653aa0c018d1e8b1412a623bc2a32ce42e8c0180 |
| electron/preload.cjs | 50241c1b577ad492f6c0a82513d9eb1bd7c41d52862fa266b0611b1d173b3ea6 |
| electron/store.cjs | 6df90536466acbc62aff4b061d25f259be54b00ffd857baf1f9d2ab07f470e0c |
| electron/sync-engine.cjs | fdd75effd06b7536c423761d7b45df84ea40a9931ac9cd2f8ffdd11bba96bcd6 |
| electron/sync-state.cjs | 86a01d23814d354ec03fc0bcb2270148d6bc0fa5fa6442ed094858f4b0046544 |
| electron/todoist-client.cjs | 1f4f3d7ef27f76c28fa42c4772ce7f3f00c72991e7d9c08050d2e13031f5641d |
| electron/window-state.cjs | 60aa774fbb9a4b89f2b13dabf4662ef07f777e50dc7183340019d1d34ad31a4d |
| index.html | 729b180be124febe6ef5dce349cfd3454faaeb707cf383d761a9af2c071d523b |
| LICENSE | ffcca38841adb694b6f380647e15f17c446a4d1656fed51a1e2041d064c94cc8 |
| NOTICE.md | 5dc37bd3cf5fafa9c68a4ff0a640dd1cbcf1f32cb6bee0103d268812273ceed1 |
| package-lock.json | 63ff895aefe4b0ed32bdd60245d510c1b382c41e22838950bfeceb40bcb27003 |
| package.json | 53758d623a13524e0e16837a770083f4cd8932151e0d38dcc954049ca3f94a50 |
| playwright.config.cjs | 537a951d5f1ea25c76a016c65c0fe7ff17c06239a24f29e5d8866bca6746d9a4 |
| playwright.v130.config.cjs | 43dd6ccbc92f17dacd2df0be4e519fff09745e0ba770742fdb7ad45fcddef900 |
| playwright.v131.config.cjs | 8276cbb7c5b35be5fbc27304a2b6baf18e472b4839b78fc039a27f251d7f3880 |
| README.md | 59862d27d1b4d8f29f500d42a34b8f939e947782daa522dc7b1fb6ee4c78d0f2 |
| README.zh-CN.md | 0d539c94980573c90bae0c74dbee416c40a73c92c729e7af67311d4dd3c1a838 |
| scripts/dev.cjs | 56f41bd0df71dde75425f35919da8468c154f1330cbea0de46eb3154131a178f |
| scripts/icons.ps1 | 4a7f6c615f8e5790059e53389ba0acfe756f89e6c25d0292df6451708e56d487 |
| scripts/invoke-cli.ps1 | ec8b393d9ec73dcfdc9d56899911e9015196a99971f17e27598a57812e092a75 |
| scripts/native-test.ps1 | 3d1d12d3cfce339f2eb66a161a4673c0006f470745d47991b2c9b1120856b2f6 |
| scripts/package.cjs | 160243fca552fd4435213dfd43273b53b1a696f2b5fa6f8c645e29eebe33b4f8 |
| scripts/ui-fixture.cjs | f5cdd9f94c9dee0ee995eaf34a59c69a2757136e2108fa9adf8116cb5d6343fa |
| src/main.tsx | 70989f8548d406b3a4df6cba65fc2cb1ec2004d05eca953ac1b85416893d7cf3 |
| src/style.css | 94e75cdc8eb9c07d47a10ec7238979dc26a8cf99817154e259fa1d9b0f719124 |
| src/sync.css | c86817cef5900f40676590c821f215de3e4cb3e75e7db9fd045a7e1663910938 |
| src/TodoistSettings.tsx | 1e1159d4d1f22d812477bd1993f1882f00e95f69f0e3b7b497b9527d3dc599a1 |
| src/types.ts | fc6915ab3ae1ce9b9541469b636d928767e365e7a482b4d8981e271cfd7e732e |
| src/UndoToast.tsx | 26a26511a3e580f1b10959008a38438c790556871531132857a8a6128e1dae1c |
| src/useCompletionFeedback.ts | 27dcad0552911fff20d6700620a1a27fac489d5132e39026776c3f662ecaf257 |
| src/useKeyboardInteraction.ts | 24abfbad13a215214a359e97858353b311482b9089c552f7bbee5a2915727f89 |
| src/useRowReorder.ts | 5e1ddf9985d998c960779d891834662c3d73df73470573e2dc66d8c40d2d7bbc |
| tests/e2e/app.spec.cjs | 7f73b3ba4e9025f76b6b8badd187f214d680febbaee0d99ca95b9d5c33719da7 |
| tests/e2e/dev.spec.cjs | 4f9e535118b9e40413bccc0e17b944e6db6a82e5b6df3e3b8301041d4d9aa61f |
| tests/e2e/edge.spec.cjs | c4c4d6a223ba8b839764ad063278d2fcde53c92285d405ead7f86e1b01d7e1fc |
| tests/e2e/final.spec.cjs | 7e87175102e12d2bbfd644c996cbc9b3e8464ccbc75f017483574a34a2eca3fd |
| tests/e2e/native.spec.cjs | 48ff23b3f62ee960e57b988a88b44ece33ec61cc35d9014a2761bf6b8e4a4edc |
| tests/e2e/quality.spec.cjs | 1346f19042b12a44b3e9494b461181893733c728541f29a0b6b99a089ba294a1 |
| tests/e2e/refinement.spec.cjs | 9d3ded64563a6ebe2c9814fe7aecd6388f181974c2051b1b38219b2f81fe4717 |
| tests/helpers/fake-todoist.cjs | 2935eb925b0f2ae6b7c4c426ea7eda7aea1d324d12ce113df6e3fb3e67fcc311 |
| tests/interaction.test.cjs | 2a5066d2be6bff4adf307c071d0387d757de77527aa921e44219a885a2d47ab2 |
| tests/model.test.cjs | 39cf0a483ae6cb7d27570a375f4553f97494b52a9fd819166f3f165cc53155aa |
| tests/project-selection.test.cjs | d1ee6e00f3a8ca835fc07f0e6dd3017b175e8999fc44afd22004b67f39b939b1 |
| tests/reorder.test.cjs | 90a06ddbe9c91591fd8491788f1f8f8b3b9576bd010afb441110f3e085f2c35e |
| tests/store.test.cjs | 28a66318d194ff019ec44669ce4ba24f2f704ad52857f770fb8f37f3548c2eeb |
| tests/sync.test.cjs | 478a97d9eeabb6483774d543fc5137db3d7719fe47745f048b8700076a856cef |
| tests/todoist-client.test.cjs | cca81b55a878e1b6d456f3c63bb1de949e84a94dd9024471e691ba822bf798f8 |
| tests/v130/reorder.spec.cjs | 641a669badac0763a2a6b24958e612f1fff2f4b3ea58f55261790e5e60a317e7 |
| tests/v131/project-ui.spec.cjs | cfbea9dc91d239d1ec1c20ae140f71ed0946f6cab0c6536a457dc6076b1144a9 |
| tests/window.test.cjs | ad3c7852af10daa0351ffbb3aca8339ae8c78817f496293826edf8b32bcb59a3 |
| THIRD_PARTY_NOTICES.md | 87774e022e3400ed9b7658955548eb2f08a22c87b2db66af9b87c0c9b3986799 |
| tsconfig.json | 7ba5e735515be20ccdb4553f00a14ba65d9b6209197f65f902c166b7e1212acd |
| vite.config.mjs | c4e31771513f0690fcc381a3e3a7343aed3fffa017ecb2908f2d805ee4e3cd70 |
| OPEN_SOURCE_SOURCE_MANIFEST.md | Self-hash omitted by design |
