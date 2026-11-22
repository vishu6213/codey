import { homedir } from "node:os";
import { join } from "node:path";
import { AiVaultStorage } from "./storage.ts";
import { AiVaultIndexer, type IndexResult } from "./indexer.ts";
import type {
  AiVaultSearchRequest,
  AiVaultSearchResponse,
  AiVaultStatus,
} from "./types.ts";

export class AiVaultService {
  private static instance: AiVaultService | null = null;
  private readonly storage: AiVaultStorage;
  private readonly indexer: AiVaultIndexer;

  constructor(customDbPath?: string) {
    const dbPath =
      customDbPath ||
      join(
        process.env.CODEY_STATE_DIR || join(homedir(), ".codey"),
        "ai-vault",
        "session-search.sqlite"
      );
    this.storage = new AiVaultStorage(dbPath);
    this.storage.init();
    this.indexer = new AiVaultIndexer(this.storage);
  }

  public static getInstance(customDbPath?: string): AiVaultService {
    if (!AiVaultService.instance) {
      AiVaultService.instance = new AiVaultService(customDbPath);
    }
    return AiVaultService.instance;
  }

  public async scan(options?: { force?: boolean }): Promise<IndexResult> {
    return this.indexer.scanAndIndex(options);
  }

  public search(request: AiVaultSearchRequest): AiVaultSearchResponse {
    return this.storage.search(request);
  }

  public getStatus(): AiVaultStatus {
    return this.storage.getStatus();
  }

  public close(): void {
    this.storage.close();
  }
}

