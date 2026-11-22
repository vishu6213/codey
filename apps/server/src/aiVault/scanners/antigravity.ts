import { createReadStream, existsSync, readdirSync } from "node:fs";
import { createInterface } from "node:readline";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import type { AiVaultMessage, AiVaultSession } from "../types.ts";
import type { ParsedSessionResult } from "./claude.ts";

export function getAntigravitySessionRoots(): string[] {
  const brainDir = join(homedir(), ".gemini", "antigravity", "brain");
  if (existsSync(brainDir)) {
    return [brainDir];
  }
  return [];
}

export function discoverAntigravityFiles(): string[] {
  const roots = getAntigravitySessionRoots();
  const files: string[] = [];

  for (const root of roots) {
    try {
      const convDirs = readdirSync(root, { withFileTypes: true });
      for (const convDir of convDirs) {
        if (!convDir.isDirectory()) continue;
        const transcriptPath = join(
          root,
          convDir.name,
          ".system_generated",
          "logs",
          "transcript.jsonl"
        );
        if (existsSync(transcriptPath)) {
          files.push(transcriptPath);
        }
      }
    } catch {
      // ignore
    }
  }

  return files;
}

export async function parseAntigravitySessionFile(
  filePath: string
): Promise<ParsedSessionResult | null> {
  // Path format: .../brain/<conversation-id>/.system_generated/logs/transcript.jsonl
  const parentLogs = dirname(filePath);
  const parentSys = dirname(parentLogs);
  const convDir = dirname(parentSys);
  const sessionId = basename(convDir);

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
      const ts = record.created_at || null;
      if (ts) {
        if (!createdAt) createdAt = ts;
        updatedAt = ts;
      }

      // User prompt
      if (record.type === "USER_INPUT" && record.content) {
        let content = String(record.content);
        // Extract clean prompt from <USER_REQUEST> if present
        const reqMatch = /<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i.exec(content);
        if (reqMatch && reqMatch[1]) {
          content = reqMatch[1].trim();
        }

        // Try extracting active workspace / cwd from ADDITIONAL_METADATA if available
        if (!cwd) {
          const cwdMatch = /Active Workspaces:\s*-\s*([^\r\n]+)/i.exec(record.content);
          if (cwdMatch && cwdMatch[1]) {
            cwd = cwdMatch[1].trim();
          }
        }

        messages.push({
          role: "user",
          text: content,
          timestamp: ts,
        });

        if (!title) {
          title = content.slice(0, 60).replace(/\n/g, " ");
        }
      }

      // Assistant turn
      if (record.type === "PLANNER_RESPONSE") {
        let text = "";
        if (record.content) {
          text = String(record.content);
        } else if (record.thinking) {
          text = String(record.thinking).slice(0, 500);
        }

        if (record.tool_calls && Array.isArray(record.tool_calls)) {
          const toolNames = record.tool_calls
            .map((c: any) => c.name)
            .filter(Boolean)
            .join(", ");
          if (toolNames) {
            text += text ? `\n[Tools: ${toolNames}]` : `[Tools: ${toolNames}]`;
          }
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
      // ignore
    }
  }

  if (messages.length === 0) {
    return null;
  }

  const session: AiVaultSession = {
    agent: "antigravity",
    sessionId,
    title: title || `Antigravity Session ${sessionId.slice(0, 8)}`,
    cwd,
    createdAt,
    updatedAt: updatedAt || createdAt,
    messageCount: messages.length,
    filePath,
    resumeCommand: `agy resume ${sessionId}`,
  };

  return { session, messages };
}

