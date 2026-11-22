import { useEffect, useRef, useState } from "react";
import { useUiTheme } from "../hooks/useUiTheme";

export function SplineBackground() {
  const { uiTheme } = useUiTheme();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [, setIsLoaded] = useState(false);

  useEffect(() => {
    if (uiTheme !== "robo") return;

    let rafId: number | null = null;
    let pendingEvent: { clientX: number; clientY: number; screenX: number; screenY: number } | null = null;

    const dispatchMove = () => {
      rafId = null;
      if (!pendingEvent) return;
      const iframe = iframeRef.current;
      if (!iframe) return;

      try {
        // Fast direct call if same origin
        const contentWin = iframe.contentWindow as (Window & { handleCodeyMouseMove?: (x: number, y: number) => void }) | null;
        if (contentWin && typeof contentWin.handleCodeyMouseMove === "function") {
          contentWin.handleCodeyMouseMove(pendingEvent.clientX, pendingEvent.clientY);
          return;
        }
      } catch (_) {
        // Fall back to postMessage across origins if sandboxed
      }

      iframe.contentWindow?.postMessage(
        {
          type: "codey:mousemove",
          clientX: pendingEvent.clientX,
          clientY: pendingEvent.clientY,
          screenX: pendingEvent.screenX,
          screenY: pendingEvent.screenY,
        },
        "*",
      );
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (document.hidden) return;
      pendingEvent = {
        clientX: e.clientX,
        clientY: e.clientY,
        screenX: e.screenX,
        screenY: e.screenY,
      };
      if (rafId === null) {
        rafId = requestAnimationFrame(dispatchMove);
      }
    };

    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [uiTheme]);

  if (uiTheme !== "robo") return null;

  return (
    <div
      aria-hidden="true"
      data-codey-spline-background="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      style={{
        zIndex: 0,
      }}
    >
      <iframe
        ref={iframeRef}
        src="/spline/index.html"
        title="Codey 3D Background"
        tabIndex={-1}
        onLoad={() => setIsLoaded(true)}
        className="pointer-events-none absolute inset-0 h-full w-full border-none outline-none"
        style={{
          pointerEvents: "none",
          width: "100%",
          height: "100%",
          border: "none",
          background: "#000",
          transform: "translate3d(0, 0, 0)",
          backfaceVisibility: "hidden",
          willChange: "transform",
        }}
      />
    </div>
  );
}
