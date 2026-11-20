# Third-party notices

FloatTodo's original project code is prepared as source-available under [PolyForm Noncommercial License 1.0.0](LICENSE). It does not replace or restrict third-party licenses. Original project copyright: 2026 Peiying Ma; see [NOTICE.md](NOTICE.md). This attribution does not claim authorship of third-party components.

- React 19.3.1, React DOM 19.3.1 and scheduler 0.28.0: MIT; full bundled text is retained in assets/THIRD_PARTY_LICENSES.txt. Its historical V1.3.0 heading is retained byte-for-byte; the listed dependency versions also apply to this 1.3.1 candidate.
- Electron 45.2.1: retain its LICENSE.electron.txt with a distributed runtime.
- Chromium and bundled runtime components: retain the complete LICENSES.chromium.html supplied with the pinned Electron runtime. The runtime is not vendored in this source snapshot. These files were present in the existing 1.3.1 unpacked runtime; any future packaged release must preserve them.
- Development dependencies retain their package licenses. The lockfile includes MPL-2.0 lightningcss packages used by the build toolchain; they were not found in the existing application ASAR. Do not relabel third-party source as project-owned PolyForm code when redistributing it. Consult the original license if distributing modified third-party components.

The app icon assets/icon.png and assets/icon.ico have a project-local geometric drawing source in scripts/icons.ps1. UI icons are code-drawn SVG; no external font files or reference media are included. The confirmed original-project notice is in NOTICE.md; third-party components remain under their own licenses.

Reference videos, reference archives, recording captures and historical screenshots are excluded. This file is a distribution guide, not a full replacement for dependency license texts.
