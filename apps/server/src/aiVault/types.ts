export const AI_VAULT_AGENTS = [
  "cursor",
  "claude",
  "copilot",
  "codex",
  "gemini",
  "antigravity",
  "cline",
  "opencode",
  "grok",
  "kimi",
  "kiro",
] as const;

export type AiVaultAgent = (typeof AI_VAULT_AGENTS)[number];

export const AI_VAULT_AGENT_LABELS: Record<AiVaultAgent, string> = {
  cursor: "Cursor",
  claude: "Claude Code",
  copilot: "GitHub Copilot",
  codex: "Codex",
  gemini: "Gemini CLI",
  antigravity: "Antigravity",
  cline: "Cline",
  opencode: "OpenCode",
  grok: "Grok",
  kimi: "Kimi",
  kiro: "Kiro",
};

export type MessageRole = "user" | "assistant" | "system" | "tool" | "unknown";

export interface AiVaultMessage {
  readonly role: MessageRole;
  readonly text: string;
  readonly timestamp?: string | null;
}

export interface AiVaultSession {
  readonly id?: number;
  readonly agent: AiVaultAgent;
  readonly sessionId: string;
  readonly title: string;
  readonly cwd: string | null;
  readonly branch?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly messageCount: number;
  readonly filePath: string;
  readonly resumeCommand: string;
}

export interface AiVaultSearchHit {
  readonly session: AiVaultSession;
  readonly evidence: {
    readonly role: MessageRole;
    readonly snippet: string;
    readonly timestamp: string | null;
  };
  readonly rank: number;
}

export interface AiVaultSearchRequest {
  readonly query: string;
  readonly agent?: AiVaultAgent | undefined;
  readonly limit?: number | undefined;
  readonly scopePaths?: readonly string[] | undefined;
}

export interface AiVaultSearchResponse {
  readonly hits: readonly AiVaultSearchHit[];
  readonly total: number;
  readonly durationMs: number;
}

export interface AiVaultStatus {
  readonly enabled: boolean;
  readonly totalSessions: number;
  readonly totalMessages: number;
  readonly sessionsByAgent: Record<string, number>;
  readonly lastScanAt: string | null;
}

