import type { ReactNode } from "react";

export function FirstRunGate({
  children,
}: {
  readonly enabled?: boolean;
  readonly hostedStatic?: boolean;
  readonly children: ReactNode;
}) {
  return <>{children}</>;
}
