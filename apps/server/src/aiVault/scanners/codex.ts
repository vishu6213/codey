import { createReadStream, existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { AiVaultMessage, AiVaultSession } from "../types.ts";
import type { ParsedSessionResult } from "./claude.ts";

export function getCodexSessionRoots(): string[] {
  const roots: string[] = [];
  const codexHome = join(homedir(), ".codex", "sessions");
  if (existsSync(codexHome)) {
    roots.push(codexHome);
  }
  const codexT3Home = join(homedir(), ".codex-t3", "sessions");
  if (existsSync(codexT3Home)) {
    roots.push(codexT3Home);
  }
  return roots;
}

export function discoverCodexFiles(): string[] {
  const roots = getCodexSessionRoots();
  const files: string[] = [];

  for (const root of roots) {
    try {
      const walk = (dir: string) => {
        const entries = readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = join(dir, entry.name);
          if (entry.isDirectory()) {
            walk(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith(".jsonl") || entry.name.endsWith(".json"))) {
            files.push(fullPath);
          }
        }
      };
      walk(root);
    } catch {
      // ignore
    }
  }

  return files;
}

function cleanCodexText(text: string): string {
  if (!text) return "";
  return text
    .replace(/<environment_context>[\s\S]*?<\/environment_context>/g, "")
    .replace(/<permissions instructions>[\s\S]*?<\/permissions instructions>/g, "")
    .replace(/<collaboration_mode>[\s\S]*?<\/collaboration_mode>/g, "")
    .replace(/<t3_code_[^>]+>[\s\S]*?<\/t3_code_[^>]+>/g, "")
    .replace(/<[^>]+>/g, "")
    .trim();
}

export async function parseCodexSessionFile(
  filePath: string
): Promise<ParsedSessionResult | null> {
  const fileName = basename(filePath);
  let sessionId = fileName.replace(/\.(jsonl|json)$/, "");

  const messages: AiVaultMessage[] = [];
  let title: string | null = null;
  let cwd: string | null = null;
  let createdAt: string | null = null;
  let updatedAt: string | null = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const record = JSON.parse(trimmed);
      const ts = record.timestamp || record.created_at || null;
      if (ts) {
        if (!createdAt) createdAt = ts;
        updatedAt = ts;
      }

      // Check session_meta
      if (record.type === "session_meta" && record.payload) {
        if (record.payload.id || record.payload.session_id) {
          sessionId = record.payload.id || record.payload.session_id;
        }
        if (record.payload.cwd && !cwd) cwd = record.payload.cwd;
        if (record.payload.timestamp && !createdAt) createdAt = record.payload.timestamp;
      }

      if (record.cwd && !cwd) cwd = record.cwd;
      if (record.title && !title) title = record.title;

      // Format A: T3/Codex payload wrapper
      if (record.type === "response_item" && record.payload?.type === "message") {
        const role = record.payload.role;
        if (role === "user" || role === "assistant") {
          const contents = Array.isArray(record.payload.content) ? record.payload.content : [];
          let combined = "";
          for (const item of contents) {
            if (item && item.text) {
              const cleaned = role === "user" ? cleanCodexText(item.text) : item.text;
              if (cleaned) {
                combined += (combined ? "\n" : "") + cleaned;
              }
            }
          }
          if (combined.trim()) {
            messages.push({
              role: role === "user" ? "user" : "assistant",
              text: combined.trim(),
              timestamp: ts,
            });
            if (role === "user" && !title && combined.trim().length > 0) {
              title = combined.trim().slice(0, 60).replace(/\n/g, " ");
            }
          }
        }
      }

      // Format B: Flat role/type
      if (record.role === "user" || record.type === "user") {
        const raw = record.text || record.content || record.prompt || "";
        const text = typeof raw === "string" ? cleanCodexText(raw) : "";
        if (text) {
          messages.push({ role: "user", text, timestamp: ts });
          if (!title) title = text.slice(0, 60).replace(/\n/g, " ");
        }
      } else if (record.role === "assistant" || record.type === "assistant") {
        const raw = record.text || record.content || record.response || "";
        const text = typeof raw === "string" ? raw.trim() : "";
        if (text) {
          messages.push({ role: "assistant", text, timestamp: ts });
        }
      }
    } catch {
      // ignore
    }
  }

  if (messages.length === 0) {
    return null;
  }

  const session: AiVaultSession = {
    agent: "codex",
    sessionId,
    title: title || `Codex Session ${sessionId.slice(0, 8)}`,
    cwd,
    createdAt,
    updatedAt: updatedAt || createdAt,
    messageCount: messages.length,
    filePath,
    resumeCommand: `codex resume ${sessionId}`,
  };

  return { session, messages };
}

