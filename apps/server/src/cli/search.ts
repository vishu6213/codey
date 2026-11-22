import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import { Argument, Command, Flag } from "effect/cli";
import { AiVaultService } from "../aiVault/service.ts";
import { AI_VAULT_AGENT_LABELS, type AiVaultAgent } from "../aiVault/types.ts";

export const searchCommand = Command.make("search", {
  query: Argument.String("query").pipe(Argument.optional),
  agent: Flag.String("agent").pipe(
    Flag.withDescription("Filter results by AI agent (e.g. claude, cursor, antigravity, codex)"),
    Flag.optional
  ),
  limit: Flag.Int("limit").pipe(
    Flag.withDescription("Maximum number of results to display"),
    Flag.withDefault(10)
  ),
  scan: Flag.Boolean("scan").pipe(
    Flag.withDescription("Trigger an immediate scan of all AI session directories"),
    Flag.withDefault(false)
  ),
  status: Flag.Boolean("status").pipe(
    Flag.withDescription("Show AI Vault index status and statistics"),
    Flag.withDefault(false)
  ),
}).pipe(
  Command.withDescription("Search transcripts and chat history across all local AI coding assistants (AI Vault)."),
  Command.withHandler(({ query, agent, limit, scan, status }) =>
    Effect.promise(async () => {
      const service = AiVaultService.getInstance();

      if (scan) {
        console.log("🔍 Scanning local AI sessions (Claude, Cursor, Codex, Antigravity, etc.)...");
        const scanRes = await service.scan({ force: true });
        console.log(`✅ Scan finished in ${scanRes.durationMs}ms: Indexed ${scanRes.indexed} new/updated sessions, skipped ${scanRes.skipped}.`);
      }

      if (status || query._tag === "None") {
        const currentStatus = service.getStatus();
        console.log("\n📦 AI Vault Status:");
        console.log(`  Total Sessions: ${currentStatus.totalSessions}`);
        console.log(`  Total Messages: ${currentStatus.totalMessages}`);
        console.log(`  Last Scan: ${currentStatus.lastScanAt ?? "Never"}`);
        console.log("  Sessions by Agent:");
        for (const [a, count] of Object.entries(currentStatus.sessionsByAgent)) {
          const label = AI_VAULT_AGENT_LABELS[a as AiVaultAgent] || a;
          console.log(`    • ${label}: ${count}`);
        }
        if (query._tag === "None") {
          console.log("\n💡 Usage: codey search \"<query>\" [--agent claude|cursor|antigravity] [--scan]");
          return;
        }
      }

      const queryString = query.value.trim();
      const selectedAgent = agent._tag === "Some" ? (agent.value as AiVaultAgent) : undefined;

      // Auto-scan if empty
      const initialStatus = service.getStatus();
      if (initialStatus.totalSessions === 0 && !scan) {
        await service.scan();
      }

      const res = service.search({
        query: queryString,
        agent: selectedAgent,
        limit,
      });

      console.log(`\n🔎 Found ${res.hits.length} matches for "${queryString}" (${res.durationMs}ms):\n`);

      if (res.hits.length === 0) {
        console.log("  No matches found. Try running with --scan to refresh transcripts.");
        return;
      }

      for (let i = 0; i < res.hits.length; i++) {
        const hit = res.hits[i];
        const agentLabel = AI_VAULT_AGENT_LABELS[hit.session.agent] || hit.session.agent;
        const time = hit.evidence.timestamp ? ` [${hit.evidence.timestamp.slice(0, 19).replace("T", " ")}]` : "";

        console.log(`${i + 1}. [${agentLabel}] ${hit.session.title}${time}`);
        if (hit.evidence.snippet) {
          const roleBadge = hit.evidence.role.toUpperCase();
          console.log(`   ${roleBadge}: ${hit.evidence.snippet.replace(/\n+/g, " ")}`);
        }
        if (hit.session.cwd) {
          console.log(`   CWD: ${hit.session.cwd}`);
        }
        if (hit.session.resumeCommand) {
          console.log(`   Resume: ${hit.session.resumeCommand}`);
        }
        console.log();
      }
    })
  )
);
