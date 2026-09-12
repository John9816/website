# Production Image API Integration And Deployment Plan

> Workspace note: the expected `.trellis/` workflow metadata is not present in this checkout.

**Goal:** Route all newly created image assets through the backend image host service, connect the frontend to the backend contracts, and deploy the verified full system to ECS.

**Architecture:** The browser only calls same-origin `/api` endpoints. Spring Boot owns image-host uploads, persistence, and business URL assignment; the Node ECS server continues proxying `/api` to Spring Boot. Existing release directories remain immutable and an ECS symlink is switched only after health and smoke checks pass.

**Tech Stack:** React 18, TypeScript, Vite, Spring Boot, JPA, MySQL, Node ECS server, JWT, xunhuisi `Tc.php` image host.

**Spec:** Confirmed chat design: unified image hosting, broad backend API integration, production deployment.

## Global Constraints

- Use `https://api.xunhuisi.store/API/Tuchuang/Tc.php` for server-side image uploads; `detail.html?id=26` is documentation only.
- Never expose image-host or backend secrets to the browser.
- Preserve existing user data, dirty worktrees, shared uploads, and rollback releases.
- Do not call playback or generation endpoints merely for smoke testing.
- New image failures must produce an explicit failed state and remain retryable.

---

### Task 1: Centralize Backend Image Storage

**Files:**
- Modify: `website-backend/src/main/java/com/example/website/service/GeneratedImageService.java`
- Modify: `website-backend/src/main/java/com/example/website/service/UserProfileService.java`
- Modify: `website-backend/src/main/java/com/example/website/controller/KnowledgeAssetController.java`
- Modify: `website-backend/src/main/java/com/example/website/service/ArticleVisualService.java`
- Test: existing image, profile, KB, and content service tests

- [x] Write tests proving remote image results, avatars, KB image assets, and article visuals persist the image-host `purl`.
- [x] Run focused Maven tests for the image, profile, KB, and content paths. The completed suite validates failure/retry behavior without intentionally reintroducing direct/local persistence.
- [x] Inject the existing `ImageStorageService`; upload bytes/references server-side and persist returned `purl` while retaining task failure and retry semantics.
- [ ] Complete migration of every legacy image reference. New and rewritten KB documents are normalized, but legacy KB local images and third-party music/navigation covers are not bulk migrated. Seven unavailable image references remain intentionally retained for follow-up: generated-image IDs 18, 21, and 54 have source connection failures; IDs 78, 79, and 80 have source 404 responses; user avatar ID 1 also returns 404.
- [x] Run focused tests, then the full Maven test suite: 268 tests, zero failures, errors, or skipped tests.

### Task 2: Complete Frontend API Contracts

**Files:**
- Modify: `website/src/api/*.ts`
- Modify: `website/src/pages/AiChatPage.tsx`
- Modify: `website/src/pages/AiImagePage.tsx`
- Modify: `website/src/pages/Music*.tsx`
- Modify: `website/src/pages/kb/*.tsx`
- Modify: `website/src/pages/Admin*.tsx`
- Test: TypeScript build and browser smoke flows

- [x] Map each current frontend call to the backend API index and identify direct external calls or missing states; see `docs/api-coverage-20260909.md`.
- [x] Add typed request wrappers for the implemented backend resources, preserving JWT refresh and 401/403 behavior.
- [x] Replace image-bearing direct URLs in the integrated flows with backend-provided hosted URLs and add loading, empty, error, retry states.
- [x] Keep SSE, audio upload, music playback, and existing route permissions intact.
- [x] Run frontend lint/build and `git diff --check` without paid generation or playback writes. Deferred backend/frontend coverage, including video, book sources, performance pages, and remaining membership administration, is tracked in `docs/api-coverage-20260909.md`.

### Task 3: Production Release Verification

**Files:**
- Modify: `website/docs/ecs-deployment.md`
- Create: deployment verification notes under `website/docs/`

- [x] Build backend and frontend from the reviewed worktrees; backend tests are green and frontend lint/build completes.
- [x] Verify image-host upload with a disposable test image and confirm the returned `purl` is persisted in DB (`image_asset` currently has 11 persisted rows). A recoverable database backup is retained.
- [x] Complete the final public endpoint and authenticated smoke pass: health, navigation, shared images, installer metadata, AI guest pages, music app, profile, credits, membership, and KB spaces.
- [x] Activate immutable release `20260909T023000Z-production-final`, preserving shared uploads/environment files and atomically switching `/opt/website/current` after archive checksum validation.
- [x] Restart the intended services, verify internal/public HTTPS health, and retain the previous release and database backup. Evidence and remaining limits are recorded in `docs/production-verification-20260909.md`.
