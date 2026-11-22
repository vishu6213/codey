import { statSync } from "node:fs";
import type { AiVaultStorage } from "./storage.ts";
import type { AiVaultAgent } from "./types.ts";
import { discoverClaudeFiles, parseClaudeSessionFile } from "./scanners/claude.ts";
import { discoverAntigravityFiles, parseAntigravitySessionFile } from "./scanners/antigravity.ts";
import { discoverCodexFiles, parseCodexSessionFile } from "./scanners/codex.ts";
import { discoverCursorFiles, parseCursorSessionFile } from "./scanners/cursor.ts";

export interface IndexResult {
  indexed: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

export class AiVaultIndexer {
  private readonly storage: AiVaultStorage;
  private isScanning = false;

  constructor(storage: AiVaultStorage) {
    this.storage = storage;
  }

  public async scanAndIndex(options: { force?: boolean } = {}): Promise<IndexResult> {
    if (this.isScanning) {
      return { indexed: 0, skipped: 0, failed: 0, durationMs: 0 };
    }

    this.isScanning = true;
    const start = Date.now();
    let indexed = 0;
    let skipped = 0;
    let failed = 0;

    try {
      // 1. Claude
      const claudeFiles = discoverClaudeFiles();
      for (const file of claudeFiles) {
        const res = await this.indexFile("claude", file, parseClaudeSessionFile, options.force);
        if (res === "indexed") indexed++;
        else if (res === "skipped") skipped++;
        else failed++;
      }

      // 2. Antigravity / Gemini
      const agyFiles = discoverAntigravityFiles();
      for (const file of agyFiles) {
        const res = await this.indexFile(
          "antigravity",
          file,
          parseAntigravitySessionFile,
          options.force
        );
        if (res === "indexed") indexed++;
        else if (res === "skipped") skipped++;
        else failed++;
      }

      // 3. Codex
      const codexFiles = discoverCodexFiles();
      for (const file of codexFiles) {
        const res = await this.indexFile("codex", file, parseCodexSessionFile, options.force);
        if (res === "indexed") indexed++;
        else if (res === "skipped") skipped++;
        else failed++;
      }

      // 4. Cursor
      const cursorFiles = discoverCursorFiles();
      for (const file of cursorFiles) {
        const res = await this.indexFile("cursor", file, parseCursorSessionFile, options.force);
        if (res === "indexed") indexed++;
        else if (res === "skipped") skipped++;
        else failed++;
      }

      this.storage.setLastScanTime(new Date().toISOString());
    } finally {
      this.isScanning = false;
    }

    return {
      indexed,
      skipped,
      failed,
      durationMs: Date.now() - start,
    };
  }

  private async indexFile(
    agent: AiVaultAgent,
    filePath: string,
    parser: (filePath: string) => Promise<any>,
    force = false
  ): Promise<"indexed" | "skipped" | "failed"> {
    try {
      const stat = statSync(filePath);
      const mtimeMs = stat.mtimeMs;

      if (!force && this.storage.isUpToDate(filePath, mtimeMs)) {
        return "skipped";
      }

      const parsed = await parser(filePath);
      if (!parsed || !parsed.session || parsed.messages.length === 0) {
        return "skipped";
      }

      this.storage.saveSession(parsed.session, parsed.messages, {
        path: filePath,
        mtimeMs,
        sizeBytes: stat.size,
      });

      return "indexed";
    } catch {
      return "failed";
    }
  }
}

