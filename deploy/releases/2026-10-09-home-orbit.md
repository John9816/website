# Homepage orbit release

- Production: https://hi.751152.xyz/
- Release: `20261009T152559Z-homepage-orbit`
- Previous: `20261001T124426Z-kb-editor`
- Server release directory: `/opt/website/releases/20261009T152559Z-homepage-orbit`
- Scope: homepage Three.js illustration, its styles and dependencies only.

The working checkout contains unrelated unpublished music and content-factory changes.
The deployment therefore used an isolated source export in `output/home-orbit-release/source`.
The reconstructed baseline preserved the deployed knowledge-base/editor changes and produced
174 JS/CSS assets byte-identical to the previous production release. The homepage changes
were then applied to that verified baseline and rebuilt.

The release preserves the previous backend JAR, frontend server, public files and old hashed
assets. The `current` symlink was switched atomically; neither service needed a restart.
The `previous` symlink retains the complete prior release.

Validation passed:

- Production TypeScript/Vite build.
- Seven browser smoke groups covering rendering, controls, themes, navigation, disposal,
  reduced motion, GPU failures and mobile layout.
- Public HTML references `/assets/index-ZqIj0RDb.js`.
- Five homepage/scene asset checksums match the release package.
- Live WebGL, pause/resume, keyboard controls and search work with all 20 real navigation links.
- No uncaught browser errors; frontend and backend services remain active.

Assets archive SHA-256:
`b13e5d9843fbdf237bb4ff1229c54ac6be198aa9211ce1161ac131eb26da14ea`

Rebuild source and provenance are saved locally under `output/home-orbit-release/` and in
the server release directory as `homepage-orbit-source.tar.gz` and `release-provenance.json`.
The live screenshot is `.codex-screenshots/home-orbit-release/production-live.png`.
