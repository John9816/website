/**
 * 极简 MCP（Model Context Protocol）客户端
 * ------------------------------------------------------------------
 * 只依赖 Node 内置模块，不引入官方 SDK。支持两种传输：
 *   - stdio：拉起本地子进程，按「一行一条 JSON-RPC 消息」收发
 *   - http ：Streamable HTTP（POST JSON-RPC，响应可能是 json 或 SSE 流）
 *
 * 已实现的生命周期与能力：
 *   initialize → notifications/initialized → tools/list → tools/call
 *
 * 安全：stdio 会执行本机命令，因此对可执行文件做了白名单校验
 * （MCP_STDIO_ALLOWLIST，逗号分隔，留空表示不限制）。
 */
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { readJson, writeJson } from "./storage.mjs";

const PROTOCOL_VERSION = "2024-11-05";
const CLIENT_INFO = { name: "xuecheng-editor", version: "1.0.0" };
const REQUEST_TIMEOUT = Number(process.env.MCP_TIMEOUT || 25000);
const MAX_OUTPUT = Number(process.env.MCP_MAX_OUTPUT || 1024 * 1024); // 单次响应上限 1MB
const DEFAULT_ALLOWLIST = ["npx", "node", "nodejs", "python3", "python", "uvx", "uv", "deno", "bun", "docker"];

function allowlist() {
  const raw = process.env.MCP_STDIO_ALLOWLIST;
  if (raw === undefined) return DEFAULT_ALLOWLIST;
  return raw.split(",").map((s) => s.trim()).filter(Boolean);
}

function checkCommand(command) {
  const list = allowlist();
  if (!list.length) return; // 空 = 不限制（不建议）
  const base = String(command || "").split(/[\\/]/).pop().toLowerCase();
  if (!list.includes(base)) {
    throw new Error(
      `命令「${base}」不在白名单内。可在环境变量 MCP_STDIO_ALLOWLIST 中添加（当前允许：${list.join(", ")}）`
    );
  }
}

/* ------------------------------------------------------------------ */
/* JSON-RPC 通道基类                                                    */
/* ------------------------------------------------------------------ */
class Channel {
  constructor(label) {
    this.label = label;
    this.nextId = 1;
    this.pending = new Map();
    this.closed = false;
    this.onClose = null;
  }

  request(method, params) {
    if (this.closed) return Promise.reject(new Error(`${this.label} 已断开`));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 超时（${REQUEST_TIMEOUT}ms）`));
      }, REQUEST_TIMEOUT);
      this.pending.set(id, { resolve, reject, timer, method });
      Promise.resolve()
        .then(() => this.send({ jsonrpc: "2.0", id, method, params }))
        .catch((e) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(e);
        });
    });
  }

  notify(method, params) {
    try {
      return Promise.resolve(this.send({ jsonrpc: "2.0", method, params }));
    } catch (_) {
      return Promise.resolve();
    }
  }

  /** 收到一条完整消息（对象或 JSON 字符串） */
  handleRaw(raw) {
    const text = typeof raw === "string" ? raw.trim() : "";
    if (!text) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch (_) {
      return; // 子进程日志混入，忽略
    }
    if (Array.isArray(msg)) return msg.forEach((m) => this.handleRaw(m));
    if (msg.id === undefined || msg.id === null) return; // 通知 / 服务端请求，暂不处理
    const p = this.pending.get(msg.id);
    if (!p) return;
    this.pending.delete(msg.id);
    clearTimeout(p.timer);
    if (msg.error) {
      const e = new Error(msg.error.message || `${p.method} 失败`);
      e.code = msg.error.code;
      e.data = msg.error.data;
      p.reject(e);
    } else {
      p.resolve(msg.result);
    }
  }

  failAll(err) {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }
}

/* ------------------------------------------------------------------ */
/* stdio 传输                                                          */
/* ------------------------------------------------------------------ */
class StdioChannel extends Channel {
  constructor(config) {
    super(config.name || "stdio");
    this.config = config;
    this.buffer = "";
    this.stderr = "";
    this.proc = null;
  }

  async start() {
    checkCommand(this.config.command);
    const args = Array.isArray(this.config.args) ? this.config.args.map(String) : [];
    const env = { PATH: process.env.PATH, HOME: process.env.EDITOR_MCP_HOME || '/tmp', LANG: 'C.UTF-8', ...(this.config.env || {}) };
    const identity = {};
    if (process.getuid?.() === 0) {
      const uid = Number(process.env.EDITOR_MCP_UID);
      const gid = Number(process.env.EDITOR_MCP_GID);
      if (!Number.isSafeInteger(uid) || uid <= 0 || !Number.isSafeInteger(gid) || gid <= 0) {
        throw new Error('管理员需先配置 MCP 非特权运行用户');
      }
      identity.uid = uid;
      identity.gid = gid;
    }

    this.proc = spawn(this.config.command, args, {
      env,
      ...identity,
      cwd: this.config.cwd || process.env.EDITOR_MCP_HOME || process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(), 400); // 有些命令不会立刻报错，给一点时间
      this.proc.once("error", (e) => {
        clearTimeout(timer);
        reject(new Error(`启动失败：${e.message}`));
      });
      this.proc.once("spawn", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk) => this.onData(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk) => {
      this.stderr = (this.stderr + chunk).slice(-4000);
    });
    this.proc.on("exit", (code, signal) => {
      this.closed = true;
      const tail = this.stderr.trim().split("\n").slice(-3).join(" | ");
      this.failAll(new Error(`MCP 进程退出（code=${code}${signal ? ", " + signal : ""}）${tail ? "：" + tail : ""}`));
      this.onClose?.();
    });
  }

  onData(chunk) {
    this.buffer += chunk;
    if (this.buffer.length > MAX_OUTPUT * 4) {
      this.buffer = this.buffer.slice(-MAX_OUTPUT);
    }
    let idx;
    // 兼容 \n 与 \r\n
    while ((idx = this.buffer.indexOf("\n")) >= 0) {
      const line = this.buffer.slice(0, idx).replace(/\r$/, "");
      this.buffer = this.buffer.slice(idx + 1);
      if (line.trim()) this.handleRaw(line);
    }
  }

  send(msg) {
    if (!this.proc || this.proc.killed) throw new Error("MCP 进程未运行");
    this.proc.stdin.write(JSON.stringify(msg) + "\n");
  }

  async close() {
    this.closed = true;
    this.failAll(new Error("已断开"));
    const child = this.proc;
    this.proc = null;
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    await new Promise(resolve => {
      const timer = setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
      }, 1500);
      child.once('exit', () => { clearTimeout(timer); resolve(); });
      child.stdin.end();
      child.kill('SIGTERM');
    });
  }

  get info() {
    return { pid: this.proc?.pid || null, stderr: this.stderr.trim().slice(-800) };
  }
}

/* ------------------------------------------------------------------ */
/* HTTP 传输（Streamable HTTP，兼容普通 JSON 与 SSE 响应）              */
/* ------------------------------------------------------------------ */
class HttpChannel extends Channel {
  constructor(config) {
    super(config.name || "http");
    this.config = config;
    this.sessionId = null;
    this.closed = false;
  }

  async start() {
    if (!/^https?:\/\//i.test(this.config.url || "")) {
      throw new Error("URL 必须以 http:// 或 https:// 开头");
    }
  }

  headers() {
    const h = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      ...(this.config.headers || {}),
    };
    if (this.sessionId) h["Mcp-Session-Id"] = this.sessionId;
    return h;
  }

  async send(msg) {
    const res = await fetch(this.config.url, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT),
    });

    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;

    if (res.status === 202 || res.status === 204) return; // 通知已接收
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`HTTP ${res.status} ${t.slice(0, 200)}`);
    }

    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (ct.includes("text/event-stream")) {
      await this.readSSE(res);
      return;
    }
    const text = await res.text();
    if (text.length > MAX_OUTPUT) throw new Error("响应体过大");
    this.handleRaw(text);
  }

  async readSSE(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    let total = 0;
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > MAX_OUTPUT) {
        reader.cancel().catch(() => {});
        throw new Error("响应体过大");
      }
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const data = block
          .split(/\r?\n/)
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .join("\n");
        if (data && data !== "[DONE]") this.handleRaw(data);
      }
    }
  }

  async close() {
    this.closed = true;
    this.failAll(new Error("已断开"));
  }

  get info() {
    return { sessionId: this.sessionId };
  }
}

/* ------------------------------------------------------------------ */
/* 连接封装：initialize → tools/list                                    */
/* ------------------------------------------------------------------ */
export class McpConnection {
  constructor(server) {
    this.server = server;
    this.channel = null;
    this.tools = [];
    this.serverInfo = null;
    this.connectedAt = null;
    this.error = null;
  }

  get connected() {
    return !!this.channel && !this.channel.closed;
  }

  async connect() {
    await this.dispose();
    const ch =
      this.server.transport === "http"
        ? new HttpChannel(this.server)
        : new StdioChannel(this.server);
    await ch.start();
    this.channel = ch;

    const result = await ch.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { roots: { listChanged: false } },
      clientInfo: CLIENT_INFO,
    });
    this.serverInfo = result?.serverInfo || null;
    await ch.notify("notifications/initialized", {});

    this.tools = await this.listTools();
    this.connectedAt = new Date().toISOString();
    this.error = null;
    return this.tools;
  }

  async listTools() {
    const out = [];
    let cursor;
    for (let i = 0; i < 20; i++) {
      const r = await this.channel.request("tools/list", cursor ? { cursor } : {});
      if (Array.isArray(r?.tools)) out.push(...r.tools);
      cursor = r?.nextCursor;
      if (!cursor) break;
    }
    return out.map((t) => ({
      name: t.name,
      description: t.description || "",
      inputSchema: t.inputSchema || { type: "object", properties: {} },
    }));
  }

  async callTool(name, args) {
    if (!this.connected) throw new Error("尚未连接");
    const r = await this.channel.request("tools/call", {
      name,
      arguments: args && typeof args === "object" ? args : {},
    });
    return normalizeResult(r);
  }

  async dispose() {
    if (this.channel) {
      const c = this.channel;
      this.channel = null;
      await c.close().catch(() => {});
    }
    this.tools = [];
  }

  status() {
    return {
      connected: this.connected,
      serverInfo: this.serverInfo,
      toolCount: this.tools.length,
      connectedAt: this.connectedAt,
      error: this.error,
      ...(this.channel?.info || {}),
    };
  }
}

/** 把 MCP tools/call 的返回统一成 { text, isError, raw } */
function normalizeResult(r) {
  const blocks = Array.isArray(r?.content) ? r.content : [];
  const parts = [];
  for (const b of blocks) {
    if (!b || typeof b !== "object") continue;
    if (b.type === "text") parts.push(b.text || "");
    else if (b.type === "resource") parts.push(b.resource?.text || `[resource] ${b.resource?.uri || ""}`);
    else if (b.type === "image") parts.push(`[image ${b.mimeType || ""} ${(b.data || "").length} bytes]`);
    else parts.push(`[${b.type || "unknown"}]`);
  }
  let text = parts.join("\n");
  if (!text && r?.structuredContent) text = JSON.stringify(r.structuredContent, null, 2);
  if (!text && typeof r === "string") text = r;
  return { text: text || "(空结果)", isError: !!r?.isError, raw: r };
}

export { normalizeResult };

/* ------------------------------------------------------------------ */
/* 管理器：配置持久化 + 连接缓存                                        */
/* ------------------------------------------------------------------ */
const TRANSPORTS = ["stdio", "http"];

function sanitize(input, prev = {}) {
  const name = String(input.name ?? prev.name ?? "").trim().slice(0, 60) || "未命名服务";
  const transport = TRANSPORTS.includes(input.transport) ? input.transport : prev.transport || "stdio";
  const next = {
    ...prev,
    name,
    transport,
    note: String(input.note ?? prev.note ?? "").slice(0, 200),
    autoConnect: input.autoConnect === undefined ? !!prev.autoConnect : !!input.autoConnect,
  };
  if (transport === "stdio") {
    next.command = String(input.command ?? prev.command ?? "").trim();
    next.args =
      input.args === undefined
        ? prev.args || []
        : Array.isArray(input.args)
          ? input.args.map((s) => String(s))
          : String(input.args).split(/\s+/).filter(Boolean);
    if (input.env !== undefined) {
      next.env = typeof input.env === "object" && input.env ? { ...input.env } : {};
    } else if (!next.env) next.env = {};
    next.cwd = String(input.cwd ?? prev.cwd ?? "").trim();
  } else {
    next.url = String(input.url ?? prev.url ?? "").trim();
    if (input.headers !== undefined) {
      next.headers = typeof input.headers === "object" && input.headers ? { ...input.headers } : {};
    } else if (!next.headers) next.headers = {};
  }
  return next;
}

export class McpManager {
  constructor(dbFile) {
    this.dbFile = dbFile;
    this.servers = [];
    this.conns = new Map();
    this.load();
  }

  load() {
    const value = readJson(this.dbFile, { servers: [] });
    if (!value || !Array.isArray(value.servers) || value.servers.some(s => !s || !s.id)) {
      throw new Error('MCP 配置损坏，请从备份恢复');
    }
    this.servers = value.servers;
  }

  save() {
    writeJson(this.dbFile, { servers: this.servers });
  }

  find(id) {
    return this.servers.find((s) => s.id === id) || null;
  }

  list() {
    return this.servers.map((s) => {
      const conn = this.conns.get(s.id);
      const { env, headers, ...safe } = s;
      return {
        ...safe,
        // 只回显键名，避免密钥出现在前端列表里
        envKeys: Object.keys(env || {}),
        headerKeys: Object.keys(headers || {}),
        status: conn ? conn.status() : { connected: false, toolCount: 0 },
        tools: conn ? conn.tools : [],
      };
    });
  }

  add(input) {
    const s = sanitize(input, {
      id: crypto.randomBytes(4).toString("hex"),
      createdAt: new Date().toISOString(),
    });
    if (s.transport === "stdio" && !s.command) throw new Error("stdio 服务必须填写 command");
    if (s.transport === "http" && !s.url) throw new Error("http 服务必须填写 url");
    this.servers.push(s);
    this.save();
    return s;
  }

  update(id, patch) {
    const idx = this.servers.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("服务不存在");
    const next = sanitize(patch, this.servers[idx]);
    this.servers[idx] = next;
    this.save();
    return next;
  }

  async remove(id) {
    const idx = this.servers.findIndex((s) => s.id === id);
    if (idx < 0) throw new Error("服务不存在");
    await this.disconnect(id);
    this.servers.splice(idx, 1);
    this.save();
  }

  async connect(id) {
    const s = this.find(id);
    if (!s) throw new Error("服务不存在");
    let conn = this.conns.get(id);
    if (!conn) {
      conn = new McpConnection(s);
      this.conns.set(id, conn);
    }
    try {
      await conn.connect();
      return conn.status();
    } catch (e) {
      conn.error = e.message;
      await conn.dispose();
      throw e;
    }
  }

  async disconnect(id) {
    const conn = this.conns.get(id);
    if (!conn) return;
    this.conns.delete(id);
    await conn.dispose();
  }

  async callTool(id, name, args) {
    const conn = this.conns.get(id);
    if (!conn || !conn.connected) throw new Error("服务未连接，请先点击连接");
    if (!name) throw new Error("缺少工具名");
    return conn.callTool(name, args);
  }

  async connectAuto() {
    for (const s of this.servers) {
      if (!s.autoConnect) continue;
      try {
        await this.connect(s.id);
        console.log(`[mcp] 已自动连接：${s.name}（${this.conns.get(s.id).tools.length} 个工具）`);
      } catch (e) {
        console.warn(`[mcp] 自动连接失败：${s.name} — ${e.message}`);
      }
    }
  }

  async disposeAll() {
    for (const id of [...this.conns.keys()]) await this.disconnect(id);
  }
}
