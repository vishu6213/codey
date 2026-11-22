import { DatabaseSync } from "node:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  AiVaultAgent,
  AiVaultMessage,
  AiVaultSearchHit,
  AiVaultSearchRequest,
  AiVaultSearchResponse,
  AiVaultSession,
  AiVaultStatus,
  MessageRole,
} from "./types.ts";

export class AiVaultStorage {
  private db: DatabaseSync | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  public init(): void {
    if (this.db) return;
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent TEXT NOT NULL,
        session_id TEXT NOT NULL UNIQUE,
        file_path TEXT NOT NULL,
        title TEXT NOT NULL,
        cwd TEXT,
        branch TEXT,
        created_at TEXT,
        updated_at TEXT,
        message_count INTEGER NOT NULL DEFAULT 0,
        resume_command TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_agent ON sessions(agent);
      CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_cwd ON sessions(cwd);

      CREATE TABLE IF NOT EXISTS files (
        path TEXT PRIMARY KEY,
        mtime_ms REAL NOT NULL,
        size_bytes INTEGER,
        session_row_id INTEGER
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_row_id INTEGER NOT NULL,
        role TEXT NOT NULL,
        timestamp TEXT,
        text TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_row_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
        user_text,
        assistant_text,
        tool_text,
        tokenize="unicode61 tokenchars '_.-/+'"
      );
    `);
  }

  public isUpToDate(filePath: string, mtimeMs: number): boolean {
    if (!this.db) this.init();
    try {
      const stmt = this.db!.prepare("SELECT mtime_ms FROM files WHERE path = ? LIMIT 1");
      const row = stmt.get(filePath) as { mtime_ms: number } | undefined;
      return row !== undefined && Math.abs(row.mtime_ms - mtimeMs) < 1;
    } catch {
      return false;
    }
  }

  public saveSession(
    session: AiVaultSession,
    messages: readonly AiVaultMessage[],
    fileStat: { path: string; mtimeMs: number; sizeBytes?: number }
  ): void {
    if (!this.db) this.init();
    const db = this.db!;

    db.exec("BEGIN IMMEDIATE;");
    try {
      // 1. Remove any existing session for this session_id or file
      const existing = db
        .prepare("SELECT id FROM sessions WHERE session_id = ? OR file_path = ? LIMIT 1")
        .get(session.sessionId, fileStat.path) as { id: number } | undefined;

      if (existing) {
        const oldMsgIds = db
          .prepare("SELECT id FROM messages WHERE session_row_id = ?")
          .all(existing.id) as Array<{ id: number }>;
        const deleteFtsStmt = db.prepare("DELETE FROM messages_fts WHERE rowid = ?");
        for (const row of oldMsgIds) {
          deleteFtsStmt.run(row.id);
        }
        db.prepare("DELETE FROM messages WHERE session_row_id = ?").run(existing.id);
        db.prepare("DELETE FROM sessions WHERE id = ?").run(existing.id);
        db.prepare("DELETE FROM files WHERE path = ?").run(fileStat.path);
      }

      // 2. Insert session row
      const insertSessionStmt = db.prepare(`
        INSERT INTO sessions (
          agent, session_id, file_path, title, cwd, branch, created_at, updated_at, message_count, resume_command
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const sessionResult = insertSessionStmt.run(
        session.agent,
        session.sessionId,
        session.filePath,
        session.title || "Untitled Session",
        session.cwd || null,
        session.branch || null,
        session.createdAt || null,
        session.updatedAt || session.createdAt || null,
        messages.length,
        session.resumeCommand || ""
      );

      const sessionRowId = Number(sessionResult.lastInsertRowid);

      // 3. Record file entry
      db.prepare(`
        INSERT OR REPLACE INTO files (path, mtime_ms, size_bytes, session_row_id)
        VALUES (?, ?, ?, ?)
      `).run(fileStat.path, fileStat.mtimeMs, fileStat.sizeBytes ?? 0, sessionRowId);

      // 4. Insert messages & FTS index
      const insertMessageStmt = db.prepare(`
        INSERT INTO messages (session_row_id, role, timestamp, text)
        VALUES (?, ?, ?, ?)
      `);

      const insertFtsStmt = db.prepare(`
        INSERT INTO messages_fts (rowid, user_text, assistant_text, tool_text)
        VALUES (?, ?, ?, ?)
      `);

      for (const msg of messages) {
        if (!msg.text || !msg.text.trim()) continue;
        const msgRes = insertMessageStmt.run(
          sessionRowId,
          msg.role,
          msg.timestamp || null,
          msg.text.trim()
        );
        const msgId = Number(msgRes.lastInsertRowid);
        insertFtsStmt.run(
          msgId,
          msg.role === "user" ? msg.text : "",
          msg.role === "assistant" ? msg.text : "",
          msg.role === "tool" ? msg.text : ""
        );
      }

      db.exec("COMMIT;");
    } catch (err) {
      db.exec("ROLLBACK;");
      throw err;
    }
  }

  public search(request: AiVaultSearchRequest): AiVaultSearchResponse {
    if (!this.db) this.init();
    const db = this.db!;
    const start = Date.now();
    const query = request.query?.trim() || "";
    if (!query) {
      return { hits: [], total: 0, durationMs: 0 };
    }

    const limit = Math.min(Math.max(request.limit ?? 25, 1), 100);

    // Build safe FTS5 query tokens
    const tokens = query
      .replace(/[^\p{L}\p{N}_\-.\s]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);

    if (tokens.length === 0) {
      return { hits: [], total: 0, durationMs: 0 };
    }

    // FTS5 expression: "token1"* AND "token2"*
    const ftsQuery = tokens.map((t) => `"${t.replace(/"/g, '""')}"*`).join(" AND ");

    const params: unknown[] = [ftsQuery];
    let agentFilter = "";
    if (request.agent) {
      agentFilter = "AND s.agent = ?";
      params.push(request.agent);
    }

    let cwdFilter = "";
    if (request.scopePaths && request.scopePaths.length > 0) {
      const placeholders = request.scopePaths.map(() => "?").join(", ");
      cwdFilter = `AND s.cwd IN (${placeholders})`;
      params.push(...request.scopePaths);
    }

    params.push(limit);

    const sql = `
      SELECT
        s.id,
        s.agent,
        s.session_id,
        s.file_path,
        s.title,
        s.cwd,
        s.branch,
        s.created_at,
        s.updated_at,
        s.message_count,
        s.resume_command,
        m.role,
        m.timestamp AS message_timestamp,
        snippet(messages_fts, 0, '[[MARK]]', '[[/MARK]]', '…', 16) AS user_snippet,
        snippet(messages_fts, 1, '[[MARK]]', '[[/MARK]]', '…', 16) AS assistant_snippet,
        bm25(messages_fts) AS rank
      FROM messages_fts
      JOIN messages m ON m.id = messages_fts.rowid
      JOIN sessions s ON s.id = m.session_row_id
      WHERE messages_fts MATCH ?
      ${agentFilter}
      ${cwdFilter}
      ORDER BY bm25(messages_fts) ASC, s.updated_at DESC
      LIMIT ?
    `;

    const sessionHitMap = new Map<string, AiVaultSearchHit>();

    // 1. Direct session matching (agent name or title matching the query)
    try {
      const likePattern = `%${query}%`;
      const directParams: unknown[] = [likePattern, likePattern];
      let directAgentFilter = "";
      if (request.agent) {
        directAgentFilter = "AND s.agent = ?";
        directParams.push(request.agent);
      }
      let directCwdFilter = "";
      if (request.scopePaths && request.scopePaths.length > 0) {
        const placeholders = request.scopePaths.map(() => "?").join(", ");
        directCwdFilter = `AND s.cwd IN (${placeholders})`;
        directParams.push(...request.scopePaths);
      }
      directParams.push(limit);

      const directSql = `
        SELECT
          s.id,
          s.agent,
          s.session_id,
          s.file_path,
          s.title,
          s.cwd,
          s.branch,
          s.created_at,
          s.updated_at,
          s.message_count,
          s.resume_command,
          COALESCE((SELECT role FROM messages WHERE session_row_id = s.id ORDER BY id DESC LIMIT 1), 'user') AS role,
          (SELECT timestamp FROM messages WHERE session_row_id = s.id ORDER BY id DESC LIMIT 1) AS message_timestamp,
          COALESCE((SELECT text FROM messages WHERE session_row_id = s.id ORDER BY id DESC LIMIT 1), s.title) AS snippet_text
        FROM sessions s
        WHERE (s.agent LIKE ? OR s.title LIKE ?)
        ${directAgentFilter}
        ${directCwdFilter}
        ORDER BY s.updated_at DESC
        LIMIT ?
      `;

      const directStmt = db.prepare(directSql);
      const directRows = directStmt.all(...directParams) as Array<{
        id: number;
        agent: string;
        session_id: string;
        file_path: string;
        title: string;
        cwd: string | null;
        branch: string | null;
        created_at: string | null;
        updated_at: string | null;
        message_count: number;
        resume_command: string;
        role: MessageRole;
        message_timestamp: string | null;
        snippet_text: string;
      }>;

      for (const row of directRows) {
        sessionHitMap.set(row.session_id, {
          session: {
            id: row.id,
            agent: row.agent as AiVaultAgent,
            sessionId: row.session_id,
            title: row.title,
            cwd: row.cwd,
            branch: row.branch,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            messageCount: row.message_count,
            filePath: row.file_path,
            resumeCommand: row.resume_command,
          },
          evidence: {
            role: row.role,
            snippet: row.snippet_text?.slice(0, 300) || row.title,
            timestamp: row.message_timestamp,
          },
          rank: -10.0,
        });
      }
    } catch (directErr) {
      console.warn("[AiVault] Direct session match warning:", directErr);
    }

    // 2. FTS5 message full-text search
    try {
      // console.log("Executing SQL:", sql, "with params:", params);
      const stmt = db.prepare(sql);
      const rows = stmt.all(...params) as Array<{
        id: number;
        agent: string;
        session_id: string;
        file_path: string;
        title: string;
        cwd: string | null;
        branch: string | null;
        created_at: string | null;
        updated_at: string | null;
        message_count: number;
        resume_command: string;
        role: MessageRole;
        message_timestamp: string | null;
        user_snippet: string;
        assistant_snippet: string;
        rank: number;
      }>;

      for (const row of rows) {
        if (!sessionHitMap.has(row.session_id)) {
          const rawSnippet = (row.user_snippet || row.assistant_snippet || "")
            .replace(/\[\[MARK\]\]/g, "")
            .replace(/\[\[\/MARK\]\]/g, "");

          sessionHitMap.set(row.session_id, {
            session: {
              id: row.id,
              agent: row.agent as AiVaultAgent,
              sessionId: row.session_id,
              title: row.title,
              cwd: row.cwd,
              branch: row.branch,
              createdAt: row.created_at,
              updatedAt: row.updated_at,
              messageCount: row.message_count,
              filePath: row.file_path,
              resumeCommand: row.resume_command,
            },
            evidence: {
              role: row.role,
              snippet: rawSnippet,
              timestamp: row.message_timestamp,
            },
            rank: row.rank,
          });
        }
      }

      const hits = Array.from(sessionHitMap.values());
      const durationMs = Date.now() - start;

      return {
        hits,
        total: hits.length,
        durationMs,
      };
    } catch (error) {
      console.error("[AiVault] Search query error:", error);
      return { hits: [], total: 0, durationMs: Date.now() - start };
    }
  }

  public getStatus(): AiVaultStatus {
    if (!this.db) this.init();
    const db = this.db!;

    try {
      const totalSessions =
        (db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number })?.count ?? 0;
      const totalMessages =
        (db.prepare("SELECT COUNT(*) AS count FROM messages").get() as { count: number })?.count ?? 0;

      const agentRows = db.prepare(
        "SELECT agent, COUNT(*) AS count FROM sessions GROUP BY agent"
      ).all() as Array<{ agent: string; count: number }>;

      const sessionsByAgent: Record<string, number> = {};
      for (const row of agentRows) {
        sessionsByAgent[row.agent] = row.count;
      }

      const lastScan = db.prepare(
        "SELECT value FROM meta WHERE key = 'last_scan_at' LIMIT 1"
      ).get() as { value: string } | undefined;

      return {
        enabled: true,
        totalSessions,
        totalMessages,
        sessionsByAgent,
        lastScanAt: lastScan?.value ?? null,
      };
    } catch {
      return {
        enabled: true,
        totalSessions: 0,
        totalMessages: 0,
        sessionsByAgent: {},
        lastScanAt: null,
      };
    }
  }

  public setLastScanTime(isoTime: string): void {
    if (!this.db) this.init();
    this.db!.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('last_scan_at', ?)").run(
      isoTime
    );
  }

  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
