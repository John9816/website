# API Coverage Audit - 2026-09-09

This is an implementation audit of the current website frontend. “Exposed” means
the frontend has a typed request wrapper and a route, page, or component that
uses the capability. It does not mean every backend endpoint in that area is
represented, nor that an upstream dependency is configured in every deployment.

## Exposed In The Website

### Identity and account

- Login, registration, registration email verification, access-token refresh,
  logout, and current-user profile loading.
- Password reset email verification and password-reset confirmation through the
  `/forgot-password` account workflow.
- Profile updates, avatar upload, password changes, credit balance, and daily
  check-in.
- Membership status and membership-code redemption from the account menu.

### Navigation and administration

- Public category/link navigation and authenticated category/link management.
- Admin user management, user password reset, system configuration management,
  redeem-code creation/listing/revocation, and content-factory operations.
- Content-factory status, hot topics, article generation (including async jobs),
  revision, visual refresh, WeChat draft/publish actions, and automation status
  or retry controls are represented in the admin surface.

### AI chat

- Available model and voice retrieval.
- Conversation create/list/read/delete, paged messages, and streamed replies.
- Audio/TTS message operations and playback are used by the chat interface.

### AI images

- Image model list, generate, edit, task polling, recoverable task list, retry,
  image history, delete, and public-share switching.
- The public image gallery uses the shared-image API.
- Image persistence is a backend responsibility; the frontend consumes the
  returned public image URLs and task states.

### Knowledge base

- Spaces, tags, document search/tree/create/read/update/delete/move, document
  tag replacement, versions, version restore, sharing, and public-share reads.
- Knowledge-base image attachment upload is used by the editor.

### Music and application distribution

- Search, playback, lyrics, toplists, playlists, albums, new releases, music
  history, favorites, favorite status, playlist import and management, playlist
  favorites, and public music sharing.
- The music application page consumes installer metadata for Android and links
  all four platform download buttons to GitHub Releases.

## Explicitly Deferred Or Not Fully Exposed

### Video

The backend exposes authenticated video source, category, filter, discovery,
search, detail, and playback endpoints. The current website has no dedicated
video route, API wrapper, or player workflow for them.

### Books and book-source management

The backend exposes book-source catalog/search/discovery/detail/chapters/content
endpoints, plus authenticated user book-source import and management. The current
website has no reader or book-source management route.

### Performance observability

The backend has an admin performance endpoint. There is no frontend performance
dashboard or typed frontend wrapper in the current website.

### Membership administration

User membership status/redemption and admin redeem-code operations are exposed.
The backend batch membership-extension capability is not represented by a
dedicated frontend operation.

### Music capability gaps

The backend contains additional music operations that do not have a confirmed
dedicated frontend control in this audit, including source-specific artist works,
playlist synchronization, and public-share status/create/delete actions. Existing
music pages should not be interpreted as full coverage of every music endpoint.

### App updates and static legacy asset reads

The backend exposes update-manifest/download endpoints and public legacy asset
read routes. The website uses installer metadata for the music-app experience but
does not provide a general update-management UI. Legacy asset read endpoints are
kept for compatibility, not presented as a content-management feature.

## Operational Notes

- All authenticated frontend requests use the shared request client, including
  refresh-token handling and authenticated error propagation.
- Image, email, AI, music, and external-content behavior still depends on their
  corresponding backend configuration and upstream availability.
- This document intentionally does not assert runtime availability, data
  completeness, production configuration, or endpoint counts.
