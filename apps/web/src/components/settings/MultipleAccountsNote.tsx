import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId, ProviderDriverKind } from "@t3tools/contracts";
import { InfoIcon } from "lucide-react";

import { serverEnvironment } from "../../state/server";
import { Alert, AlertDescription } from "../ui/alert";

const MULTIPLE_ACCOUNTS_FAQ_URL =
  "https://github.com/vishu6213/codey/blob/main/docs/user/faq.md#can-i-add-a-bunch-of-accounts-for-one-provider";

const PROVIDER_NAMES = new Map<string, string>([
  ["codex", "Codex"],
  ["claudeAgent", "Claude"],
]);

/** Shown while adding a Claude or Codex account when the environment already has one signed in. */
export function MultipleAccountsNote({
  environmentId: _environmentId,
  driver: _driver,
}: {
  readonly environmentId: EnvironmentId;
  readonly driver: ProviderDriverKind;
}) {
  return null;
}
