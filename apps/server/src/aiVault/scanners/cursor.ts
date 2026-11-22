import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { AiVaultMessage, AiVaultSession } from "../types.ts";
import type { ParsedSessionResult } from "./claude.ts";

export function getCursorWorkspaceStorageRoots(): string[] {
  const roots: string[] = [];
  const winAppData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  const cursorStorage = join(winAppData, "Cursor", "User", "workspaceStorage");

  if (existsSync(cursorStorage)) {
    roots.push(cursorStorage);
  }

  const cursorHome = join(homedir(), ".cursor", "projects");
  if (existsSync(cursorHome)) {
    roots.push(cursorHome);
  }

  return roots;
}

export function discoverCursorFiles(): string[] {
  const roots = getCursorWorkspaceStorageRoots();
  const files: string[] = [];

  for (const root of roots) {
    try {
      const dirs = readdirSync(root, { withFileTypes: true });
      for (const d of dirs) {
        if (!d.isDirectory()) continue;
        const vscdb = join(root, d.name, "state.vscdb");
        if (existsSync(vscdb)) {
          files.push(vscdb);
        }
      }
    } catch {
      // ignore
    }
  }

  return files;
}

export async function parseCursorSessionFile(
  filePath: string
): Promise<ParsedSessionResult | null> {
  const dirName = basename(filePath.replace(/[\\/]state\.vscdb$/, ""));
  const sessionId = `cursor-${dirName}`;

  try {
    const db = new DatabaseSync(filePath, { readOnly: true });
    // Cursor stores chat sessions under keys like 'workbench.panel.aichat.view.aichat.chatdata' or 'composer.composerData'
    const rows = db
      .prepare(
        "SELECT key, value FROM ItemTable WHERE key LIKE '%chat%' OR key LIKE '%composer%' LIMIT 10"
      )
      .all() as Array<{ key: string; value: string }>;

    db.close();

    if (!rows || rows.length === 0) return null;

    const messages: AiVaultMessage[] = [];
    let title: string | null = null;

    for (const row of rows) {
      if (!row.value) continue;
      try {
        const data = JSON.parse(row.value);
        // Composer format
        if (data.allComposers && Array.isArray(data.allComposers)) {
          for (const comp of data.allComposers) {
            if (comp.text) {
              messages.push({ role: "user", text: comp.text });
              if (!title) title = comp.text.slice(0, 60);
            }
          }
        }
        // Chat tab format
        if (data.tabs && Array.isArray(data.tabs)) {
          for (const tab of data.tabs) {
            if (tab.bubbles && Array.isArray(tab.bubbles)) {
              for (const b of tab.bubbles) {
                if (b.type === "user" && b.text) {
                  messages.push({ role: "user", text: b.text });
                  if (!title) title = b.text.slice(0, 60);
                } else if (b.type === "ai" && b.text) {
                  messages.push({ role: "assistant", text: b.text });
                }
              }
            }
          }
        }
      } catch {
        // ignore parse error
      }
    }

    if (messages.length === 0) return null;

    const session: AiVaultSession = {
      agent: "cursor",
      sessionId,
      title: title || `Cursor Workspace ${dirName.slice(0, 8)}`,
      cwd: null,
      messageCount: messages.length,
      filePath,
      resumeCommand: `cursor`,
    };

    return { session, messages };
  } catch {
    return null;
  }
}

