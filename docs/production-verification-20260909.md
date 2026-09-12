# Production Verification - 2026-09-09

## Active Release

- Frontend: https://hi.751152.xyz/
- Music application: https://hi.751152.xyz/music/app
- Backend health: https://api.751152.xyz/health
- Active release: `20260909T023000Z-production-final`.
- Previous release: `20260909T013505Z-fe2cc6feea73-58470c9a32cc`.
- Archive SHA-256 verified before activation: `0517d29ab662bb9a16fe287ccfab47c08695cf9db30e7b99e5320623e6bbe0d2`.
- Database: `website_java`.
- Verified backup: `/opt/website/backups/website_java-20260909T012500Z.sql.gz`, 407181 bytes, mode 600.
- Shared uploads, environment files, and existing Nginx configuration preserved.
- Both services active; internal health and same-origin API proxy checks passed.
- No error-priority systemd journal entries during the immediate post-release checks. This is not a long-duration soak or load test.

## Verification

- Backend: 268 tests, zero failures/errors/skips. Backend source unchanged during the final frontend corrections; final packaging reused this tested backend.
- Frontend: TypeScript check and production build passed, including a clean locked dependency installation.
- Both worktrees pass `git diff --check`. Existing uncommitted user changes remain intact; no commits were created.
- Public live browser checks: `/`, `/music/app`, `/ai-chat`, `/ai-image`, `/login`, `/forgot-password` at 1440 and 390 pixels, no page exceptions or outer horizontal overflow.
- Light/dark switching and the hosted real iOS screenshot render successfully. Four platform download actions open `https://github.com/John9816/music/releases`.
- Real test-account login, profile, credits, membership, and KB spaces read successfully; test refresh tokens revoked afterward.
- Public navigation, shared-image gallery, and installer metadata endpoints passed.
- Model discovery/selection and password reset were tested with intercepted APIs. No real reset email or password change was performed.
- `deploy/verify-ui.mjs` passes against the local and public frontend. All API requests are intercepted: local draft before autosave, bold/undo/redo, table rows, image HTML/JSON consistency, editor widths 1440/1024/390, failed-save content retention.
- No paid generation, music playback, or modifications to existing KB documents were used for smoke tests.

To rerun the isolated editor test, provide an installed Playwright module and browser:

```bash
PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
SMOKE_BASE_URL=https://hi.751152.xyz node deploy/verify-ui.mjs
```

## Image Storage

Server uploads use `https://api.xunhuisi.store/API/Tuchuang/Tc.php`, form fields `photo` and `type=json`. The provider currently returns ImgBB URLs. Browser code does not call the provider directly.

The production `image_asset` table contains 11 verified records. All 11 have HTTPS image URLs and nonempty original provider response JSON. They include the site branding/background/contact/sponsor assets, DuckMusic icon, real iOS screenshot, and two migrated avatars. New generated images, avatars, KB uploads/pasted images, and article image paths use the common storage service.

Storage failures are explicit failures. Image-task storage retries reuse the generated result rather than charging/generating again. Remote upload is outside KB/avatar database transactions.

Legacy originals and files were not deleted. Seven unavailable sources could not be migrated:

| Resource | IDs | Reason |
| --- | --- | --- |
| Generated image | 18, 21, 54 | Source connection/fetch failure |
| Generated image | 78, 79, 80 | Source HTTP 404 |
| User avatar | 1 | Source HTTP 404; original not found on ECS |

Legacy KB local attachments and third-party music/navigation artwork have not all been bulk migrated. `deploy/migrate-legacy-images.mjs` defaults to dry-run and preserves originals on failure. Therefore this release does not claim that every historical image has been migrated.

## Remaining Work

- See `api-coverage-20260909.md` for actual feature coverage. Video, book reading/source management, performance dashboards, and some admin/music operations do not yet have complete frontend workflows.
- Tiptap and all its extensions are pinned to 3.30.5; unused `colorthief` was removed. Production dependency audit: zero high/critical and three moderate React Router-related entries remain. Full build-tool audit still reports seven high, six moderate, and one low entries; build tooling is not loaded by the production Node server. This is not a complete security certification.
- Large Vite chunks remain, especially Ant Design/editor dependencies. Device testing used browser viewports, not a comprehensive physical Android/iOS/Windows/macOS matrix.
- Production continues using the existing schema/configuration approach. A versioned migration runner, long-duration load test, and real rollback failure drill remain operational follow-ups.
- Rotate credentials shared in chat and move routine deployment to a restricted SSH-key account. No credential rotation was performed automatically.

## Rollback

The previous immutable release is retained. Run on ECS only when rollback is intended:

```bash
bash /opt/website/current/ops/remote-rollback.sh previous
```

Code rollback does not undo database writes. Preserve the backup and review schema compatibility before restoring data.
