import { useEffect, useState } from "react";
import { useEnvironmentHttpBaseUrl, usePrimaryEnvironmentId } from "~/state/environments";

export interface AiVaultHit {
  readonly session: {
    readonly id?: number;
    readonly agent: string;
    readonly sessionId: string;
    readonly title: string;
    readonly cwd: string | null;
    readonly branch?: string | null;
    readonly createdAt?: string | null;
    readonly updatedAt?: string | null;
    readonly messageCount: number;
    readonly filePath: string;
    readonly resumeCommand: string;
  };
  readonly evidence: {
    readonly role: string;
    readonly snippet: string;
    readonly timestamp: string | null;
  };
  readonly rank: number;
}

export interface AiVaultSearchResult {
  readonly hits: readonly AiVaultHit[];
  readonly total: number;
  readonly durationMs: number;
  readonly isPending: boolean;
}

function resolveServerBaseUrl(httpBaseUrl: string | null): string {
  if (httpBaseUrl) return httpBaseUrl;
  const bridgeBootstraps = (
    window as unknown as {
      desktopBridge?: {
        getLocalEnvironmentBootstraps?: () => Array<{ httpBaseUrl?: string }>;
      };
    }
  )?.desktopBridge?.getLocalEnvironmentBootstraps?.();
  if (bridgeBootstraps && bridgeBootstraps.length > 0 && bridgeBootstraps[0]?.httpBaseUrl) {
    return bridgeBootstraps[0].httpBaseUrl;
  }
  if (typeof window !== "undefined" && window.location.protocol.startsWith("http")) {
    return window.location.origin;
  }
  return "http://127.0.0.1:3773";
}

export function useAiVaultSearch(query: string, agent?: string): AiVaultSearchResult {
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const httpBaseUrl = useEnvironmentHttpBaseUrl(primaryEnvironmentId);
  const [hits, setHits] = useState<readonly AiVaultHit[]>([]);
  const [total, setTotal] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setHits([]);
      setTotal(0);
      setDurationMs(0);
      setIsPending(false);
      return;
    }

    let cancelled = false;
    setIsPending(true);

    const timer = setTimeout(async () => {
      try {
        const baseUrl = resolveServerBaseUrl(httpBaseUrl);
        const url = new URL("/api/ai-vault/search", baseUrl);
        url.searchParams.set("q", trimmed);
        if (agent) url.searchParams.set("agent", agent);
        url.searchParams.set("limit", "15");

        const res = await fetch(url.toString(), { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error("Search failed");
        const data = await res.json();

        if (!cancelled) {
          setHits(data.hits || []);
          setTotal(data.total || 0);
          setDurationMs(data.durationMs || 0);
          setIsPending(false);
        }
      } catch {
        if (!cancelled) {
          setHits([]);
          setTotal(0);
          setIsPending(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, agent, httpBaseUrl]);

  return { hits, total, durationMs, isPending };
}

