import { createReadStream, existsSync, readdirSync, statSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { AiVaultMessage, AiVaultSession } from "../types.ts";

export interface ParsedSessionResult {
  session: AiVaultSession;
  messages: AiVaultMessage[];
}

export function getClaudeSessionRoots(): string[] {
  const claudeHome = join(homedir(), ".claude");
  const projectsDir = join(claudeHome, "projects");
  const roots: string[] = [];

  if (existsSync(projectsDir)) {
    roots.push(projectsDir);
  }

  return roots;
}

export function discoverClaudeFiles(): string[] {
  const roots = getClaudeSessionRoots();
  const files: string[] = [];

  for (const root of roots) {
    try {
      const projectDirs = readdirSync(root, { withFileTypes: true });
      for (const pDir of projectDirs) {
        if (!pDir.isDirectory()) continue;
        const subPath = join(root, pDir.name);
        try {
          const entries = readdirSync(subPath, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isFile() && entry.name.endsWith(".jsonl")) {
              files.push(join(subPath, entry.name));
            }
          }
        } catch {
          // ignore unreadable project dir
        }
      }
    } catch {
      // ignore
    }
  }

  return files;
}

export async function parseClaudeSessionFile(
  filePath: string
): Promise<ParsedSessionResult | null> {
  const fileName = basename(filePath, ".jsonl");
  const sessionId = fileName;
  const messages: AiVaultMessage[] = [];

  let title: string | null = null;
  let cwd: string | null = null;
  let createdAt: string | null = null;
  let updatedAt: string | null = null;
  let gitBranch: string | null = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    try {
      const record = JSON.parse(trimmed);

      // Track timestamps
      const ts = record.timestamp || record.created_at || null;
      if (ts) {
        if (!createdAt) createdAt = ts;
        updatedAt = ts;
      }

      if (record.cwd && !cwd) {
        cwd = record.cwd;
      }

      if (record.gitBranch && !gitBranch) {
        gitBranch = record.gitBranch;
      }

      // Extract title from slug or first request
      if (record.slug && !title) {
        title = record.slug.replace(/-/g, " ");
      }

      // User turn
      if (record.type === "user" && record.message) {
        const rawContent = record.message.content;
        let text = "";
        if (typeof rawContent === "string") {
          text = rawContent;
        } else if (Array.isArray(rawContent)) {
          text = rawContent
            .map((part: any) => part.text || part.content || "")
            .filter(Boolean)
            .join("\n");
        }

        // Extract actual user request if wrapped in naming prompt
        if (text.startsWith("Name this chat from")) {
          const firstReqMatch = /First request:\s*([\s\S]*)/i.exec(text);
          if (firstReqMatch && firstReqMatch[1]) {
            text = firstReqMatch[1].trim();
          }
        }

        if (text) {
          messages.push({
            role: "user",
            text,
            timestamp: ts,
          });

          if (!title) {
            title = text.slice(0, 60).replace(/\n/g, " ");
          }
        }
      }

      // Assistant turn
      if (record.type === "assistant" && record.message) {
        const rawContent = record.message.content;
        let text = "";
        if (typeof rawContent === "string") {
          text = rawContent;
        } else if (Array.isArray(rawContent)) {
          text = rawContent
            .map((part: any) => part.text || part.content || "")
            .filter(Boolean)
            .join("\n");
        }

        if (text) {
          messages.push({
            role: "assistant",
            text,
            timestamp: ts,
          });
        }
      }
    } catch {
      // ignore malformed line
    }
  }

  if (messages.length === 0) {
    return null;
  }

  const session: AiVaultSession = {
    agent: "claude",
    sessionId,
    title: title || `Claude Session ${sessionId.slice(0, 8)}`,
    cwd,
    branch: gitBranch,
    createdAt,
    updatedAt: updatedAt || createdAt,
    messageCount: messages.length,
    filePath,
    resumeCommand: `claude --resume ${sessionId}`,
  };

  return { session, messages };
}
