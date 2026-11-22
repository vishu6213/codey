import { describe, expect, it } from "vite-plus/test";

import {
  ClerkPublishableKeyFrontendApiError,
  clerkFrontendApiHostnameFromPublishableKey,
  clerkFrontendApiUrlFromPublishableKey,
} from "./relayAuth.ts";

const clerkPublishableKey = (hostname: string): string => `pk_test_${btoa(`${hostname}$`)}`;

const captureError = (run: () => unknown): unknown => {
  try {
    run();
  } catch (cause) {
    return cause;
  }
  throw new Error("Expected operation to throw");
};

describe("Clerk relay auth", () => {
  it("derives a custom Frontend API hostname from a Clerk publishable key", () => {
    expect(clerkFrontendApiHostnameFromPublishableKey(clerkPublishableKey("clerk.codey.app"))).toBe(
      "clerk.codey.app",
    );
    expect(clerkFrontendApiUrlFromPublishableKey(clerkPublishableKey("clerk.codey.app"))).toBe(
      "https://clerk.codey.app",
    );
  });

  it("reports semantic frontend API failures without inventing a cause", () => {
    const emptyError = captureError(() => clerkFrontendApiUrlFromPublishableKey("pk_test_"));
    const pathFrontendApi = "clerk.codey.app/path";
    const pathError = captureError(() =>
      clerkFrontendApiUrlFromPublishableKey(clerkPublishableKey(pathFrontendApi)),
    );

    expect(emptyError).toBeInstanceOf(ClerkPublishableKeyFrontendApiError);
    expect(emptyError).toMatchObject({
      keyPrefix: "pk_test",
      frontendApi: "",
      reason: "empty",
    });
    expect((emptyError as Error & { cause?: unknown }).cause).toBeUndefined();
    expect(pathError).toBeInstanceOf(ClerkPublishableKeyFrontendApiError);
    expect(pathError).toMatchObject({
      keyPrefix: "pk_test",
      frontendApi: pathFrontendApi,
      reason: "contains-path",
    });
    expect((pathError as Error & { cause?: unknown }).cause).toBeUndefined();
  });
});
