# Xuecheng integration implementation plan

> Execute inline with superpowers:executing-plans; user has approved the module and deployment.

**Goal:** Add a working, authenticated Xuecheng documents module to the website and deploy it.
**Architecture:** Vendor upstream React source with scoped styles and the existing auth client. Mount a user-scoped Node API into the existing ECS server; keep data outside releases.
**Tech Stack:** React 18, Vite 5, ProseMirror, Node 22 built-ins.
**Spec:** `docs/superpowers/specs/2026-11-07-xuecheng-integration.md`

## Constraints

Existing knowledge base and Java backend remain separate. No production data in source. Existing unrelated frontend changes remain intact. Pin upstream provenance. MCP is admin-only and child processes are unprivileged.

## Task 1: API and persistent data

- [x] Add `server/xuecheng.test.mjs`: start the actual ECS server with a local identity fixture and temporary storage; assert anonymous docs request is 401, user B cannot read/write user A documents/templates, and sharing is only public while enabled.
- [x] Run `node --test server/xuecheng.test.mjs` and observe the missing route fail.
- [x] Implement `createXuechengHandler({ backendUrl, dataDir })` in `server/xuecheng/index.mjs`, plus storage/auth and upstream MCP modules. Mount before static fallback in `server/ecs-server.mjs`.
- [x] Run new tests plus `node --test server/ecs-server.test.mjs`.

## Task 2: Integrated interface

- [x] Copy upstream source to `src/features/xuecheng`, record source commit. Replace its API request function with the existing authenticated website client, fix share URL base and save race, and restrict MCP UI by profile.
- [x] Add `src/pages/XuechengPage.tsx` with login redirect preserving the document hash; add `/editor/*`, main navigation and admin menu entries.
- [x] Scope upstream CSS and load the editor lazily; add missing ProseMirror dependency with npm lockfile.
- [x] Run `npm run lint` and `npm run build`.
- [x] Browser-test editing, rapid document switching, reload persistence, template creation, sharing and mobile entry. Verify existing knowledge base UI still works.

## Task 3: Release

- [x] Add deployment/runbook with persistent storage, MCP UID/GID, source provenance, commands and rollback.
- [x] Upload a versioned frontend release, reuse current backend, back up metadata/config, configure persistent storage and switch only after local checks.
- [x] Check API health, anonymous denial, editor entry/assets and existing home/music/knowledge-base routes. Exercise production identity-backed CRUD with temporary test fixtures and remove only those fixtures.
- [x] Record active version, verification, and rollback path; report the user-visible entry.
