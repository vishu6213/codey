import React, { useState } from "react";
import type { AiVaultHit } from "../../hooks/useAiVaultSearch";
import { toastManager } from "~/components/ui/toast";

interface AiVaultSearchResultsProps {
  readonly hits: readonly AiVaultHit[];
  readonly isPending: boolean;
  readonly query: string;
}

const AGENT_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  claude: { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", label: "Claude Code" },
  cursor: { bg: "bg-cyan-500/10 border-cyan-500/30", text: "text-cyan-400", label: "Cursor" },
  antigravity: { bg: "bg-blue-500/10 border-blue-500/30", text: "text-blue-400", label: "Antigravity" },
  codex: { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-400", label: "Codex" },
  copilot: { bg: "bg-purple-500/10 border-purple-500/30", text: "text-purple-400", label: "Copilot" },
  gemini: { bg: "bg-indigo-500/10 border-indigo-500/30", text: "text-indigo-400", label: "Gemini" },
};

function insertIntoActiveComposer(text: string): boolean {
  try {
    const editor = document.querySelector<HTMLElement>(".ProseMirror, [contenteditable='true']");
    if (editor) {
      editor.focus();
      const selection = window.getSelection();
      if (selection && selection.rangeCount > 0) {
        const range = selection.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editor.textContent = (editor.textContent ? editor.textContent + "\n" : "") + text;
      }
      editor.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }

    const textarea = document.querySelector<HTMLTextAreaElement>("textarea");
    if (textarea) {
      textarea.focus();
      textarea.value = (textarea.value ? textarea.value + "\n" : "") + text;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
  } catch (err) {
    console.warn("Could not insert context into composer:", err);
  }
  return false;
}

export function AiVaultSearchResults({ hits, isPending, query }: AiVaultSearchResultsProps): React.JSX.Element | null {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [insertedId, setInsertedId] = useState<string | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");

  if (!query.trim() || (hits.length === 0 && !isPending)) {
    return null;
  }

  // Calculate counts per agent
  const agentCounts = hits.reduce<Record<string, number>>((acc, hit) => {
    acc[hit.session.agent] = (acc[hit.session.agent] || 0) + 1;
    return acc;
  }, {});
  const agentKeys = Object.keys(agentCounts);

  const displayedHits =
    selectedAgent === "all" ? hits : hits.filter((h) => h.session.agent === selectedAgent);

  const handleCopyCommand = async (e: React.MouseEvent, hit: AiVaultHit) => {
    e.stopPropagation();
    const command = hit.session.resumeCommand || `codey search "${hit.session.title}"`;
    try {
      await navigator.clipboard.writeText(command);
      setCopiedId(hit.session.sessionId);
      setTimeout(() => setCopiedId((curr) => (curr === hit.session.sessionId ? null : curr)), 2000);
      try {
        toastManager.add({
          type: "info",
          title: "Copied Resume Command",
        });
      } catch {}
    } catch {
      // Fallback
      setCopiedId(hit.session.sessionId);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  const handleInsertIntoChat = (e: React.MouseEvent, hit: AiVaultHit) => {
    e.stopPropagation();
    const agentLabel = AGENT_COLORS[hit.session.agent]?.label || hit.session.agent;
    const contextPrompt = `Context from past ${agentLabel} session ("${hit.session.title}"):\n"${hit.evidence.snippet}"\n\n`;
    
    const success = insertIntoActiveComposer(contextPrompt);
    setInsertedId(hit.session.sessionId);
    setTimeout(() => setInsertedId((curr) => (curr === hit.session.sessionId ? null : curr)), 2000);

    try {
      toastManager.add({
        type: "info",
        title: success ? "Context Added to Chat" : "Context Ready",
      });
    } catch {}
  };

  const handleOpenFile = (e: React.MouseEvent, filePath: string) => {
    e.stopPropagation();
    try {
      const bridge = (window as unknown as { desktopBridge?: { openExternal?: (p: string) => void } })?.desktopBridge;
      if (bridge?.openExternal) {
        bridge.openExternal(filePath);
      } else {
        window.open(`file:///${filePath.replace(/\\/g, "/")}`, "_blank");
      }
    } catch (err) {
      console.warn("Could not open file:", err);
    }
  };

  const toggleExpand = (sessionId: string) => {
    setExpandedId((prev) => (prev === sessionId ? null : sessionId));
  };

  return (
    <div className="mt-3 border-t border-border/40 pt-3">
      <div className="flex items-center justify-between px-2 pb-2 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        <span className="flex items-center gap-1.5">
          <span>🗄️</span>
          <span>AI Vault History</span>
        </span>
        {isPending ? (
          <span className="text-[10px] lowercase animate-pulse">searching…</span>
        ) : (
          <span className="rounded bg-muted/60 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground">
            {displayedHits.length}{selectedAgent !== "all" ? ` of ${hits.length}` : ""} external
          </span>
        )}
      </div>

      {agentKeys.length > 1 && (
        <div className="flex flex-wrap items-center gap-1 px-1 pb-2">
          <button
            type="button"
            onClick={() => setSelectedAgent("all")}
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
              selectedAgent === "all"
                ? "bg-foreground text-background font-semibold"
                : "bg-muted/50 text-muted-foreground hover:bg-muted"
            }`}
          >
            All ({hits.length})
          </button>
          {agentKeys.map((agent) => {
            const conf = AGENT_COLORS[agent] || { label: agent, text: "text-foreground", bg: "bg-muted/30" };
            const isActive = selectedAgent === agent;
            return (
              <button
                key={agent}
                type="button"
                onClick={() => setSelectedAgent(agent)}
                className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition ${
                  isActive
                    ? `${conf.bg} ${conf.text} border-primary/50 font-semibold shadow-xs`
                    : "border-border/40 bg-muted/20 text-muted-foreground hover:bg-muted/50"
                }`}
              >
                {conf.label} ({agentCounts[agent]})
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-1.5">
        {displayedHits.map((hit, idx) => {
          const isExpanded = expandedId === hit.session.sessionId;
          const isCopied = copiedId === hit.session.sessionId;
          const isInserted = insertedId === hit.session.sessionId;
          const agentConf = AGENT_COLORS[hit.session.agent] || {
            bg: "bg-zinc-500/10 border-zinc-500/30",
            text: "text-zinc-400",
            label: hit.session.agent,
          };

          return (
            <div
              key={`${hit.session.sessionId}-${idx}`}
              onClick={() => toggleExpand(hit.session.sessionId)}
              className={`group cursor-pointer rounded-md border transition ${
                isExpanded
                  ? "border-primary/50 bg-accent/40 shadow-sm"
                  : "border-border/40 bg-card/40 hover:border-border hover:bg-accent/30"
              } p-2 text-left`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-medium ${agentConf.bg} ${agentConf.text}`}
                >
                  {agentConf.label}
                </span>

                <div className="flex items-center gap-1.5">
                  {hit.evidence.timestamp && (
                    <span className="text-[10px] text-muted-foreground/70">
                      {hit.evidence.timestamp.slice(0, 10)}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={(e) => handleCopyCommand(e, hit)}
                    title={isCopied ? "Copied!" : "Copy resume command"}
                    className={`rounded px-1.5 py-0.5 text-[10px] font-medium transition ${
                      isCopied
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                        : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground border border-border/50"
                    }`}
                  >
                    {isCopied ? "✓ Copied" : "Copy"}
                  </button>
                </div>
              </div>

              <div
                className={`mt-1 text-xs font-medium text-foreground group-hover:text-primary ${
                  isExpanded ? "" : "line-clamp-1"
                }`}
              >
                {hit.session.title}
              </div>

              {hit.evidence.snippet && (
                <div
                  className={`mt-1 rounded bg-black/20 p-1.5 text-[11px] text-muted-foreground/90 border border-white/5 ${
                    isExpanded ? "whitespace-pre-wrap font-mono text-[10.5px]" : "line-clamp-2"
                  }`}
                >
                  <span className="font-semibold text-foreground/80">
                    {hit.evidence.role === "user" ? "User: " : "AI: "}
                  </span>
                  {hit.evidence.snippet}
                </div>
              )}

              {/* Expanded Action Toolbar */}
              {isExpanded && (
                <div className="mt-2.5 pt-2 border-t border-border/30 flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={(e) => handleInsertIntoChat(e, hit)}
                    className="inline-flex items-center gap-1 rounded bg-primary/20 hover:bg-primary/30 border border-primary/40 px-2 py-1 text-[11px] font-medium text-primary transition"
                  >
                    <span>💬</span>
                    <span>{isInserted ? "✓ Added to Chat!" : "Insert into Chat"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleCopyCommand(e, hit)}
                    className="inline-flex items-center gap-1 rounded bg-muted/80 hover:bg-muted border border-border/60 px-2 py-1 text-[11px] font-medium text-foreground transition"
                  >
                    <span>📋</span>
                    <span>{isCopied ? "✓ Command Copied!" : "Copy Command"}</span>
                  </button>

                  {hit.session.filePath && (
                    <button
                      type="button"
                      onClick={(e) => handleOpenFile(e, hit.session.filePath)}
                      className="inline-flex items-center gap-1 rounded bg-muted/50 hover:bg-muted border border-border/40 px-2 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground transition"
                    >
                      <span>📂</span>
                      <span>Open File</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
