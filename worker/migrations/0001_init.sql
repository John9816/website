-- 学城编辑器 · Workers 版存储
-- 所有集合（docs/users/sessions/prefs/accessRequests/notifications/templates/trash/interactions/visitors/presence/loginFails）
-- 以 JSON 形式存于单张 kv 表，请求内由 context.js 载入内存、结束时整体落库。
DROP TABLE IF EXISTS docs;
DROP TABLE IF EXISTS templates;
CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
