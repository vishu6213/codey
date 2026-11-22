import * as child_process from "node:child_process";

/** `kill(0)` signals this server's group; `kill(-1)` signals every process the user owns. */
export function signalProcessGroup(pid: number, signal: NodeJS.Signals | 0): void {
  if (!Number.isSafeInteger(pid) || pid <= 1) {
    throw Object.assign(new Error(`kill ESRCH: not a spawned process group (${pid})`), {
      code: "ESRCH",
    });
  }
  if (process.platform === "win32") {
    if (signal === 0) {
      process.kill(pid, 0);
      return;
    }
    try {
      child_process.execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      try {
        process.kill(pid, signal);
      } catch {}
    }
    return;
  }
  process.kill(-pid, signal);
}
