-- 学城编辑器 D1 schema（Workers 版：单表 kv 存储全部集合）
-- 执行：wrangler d1 execute xuecheng --remote --file=./migrations/0001_init.sql
--
-- 设计：每请求把 D1 中全部集合（docs/users/sessions/...）载入 CTX 内存快照，
-- 请求结束整体落库。仓库业务逻辑因此可原样保留，无需逐表拆分。
-- 旧表（docs/templates）为早期表结构方案残留，这里显式丢弃，统一改用 kv。

DROP TABLE IF EXISTS docs;
DROP TABLE IF EXISTS templates;

CREATE TABLE IF NOT EXISTS kv (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
