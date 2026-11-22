import { useEffect, useRef } from "react";
import { useUiTheme } from "../hooks/useUiTheme";

export function SkeletonBackground() {
  const { uiTheme } = useUiTheme();
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (uiTheme !== "skeleton") return;
    const video = videoRef.current;
    if (!video) return;

    // Handle autoplay policy safely
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        video.muted = true;
        video.play().catch(() => {});
      });
    }

    const handleVisibility = () => {
      if (document.hidden) {
        video.pause();
      } else {
        video.play().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [uiTheme]);

  if (uiTheme !== "skeleton") return null;

  return (
    <div
      aria-hidden="true"
      data-codey-skeleton-background="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden select-none"
      style={{ zIndex: 0 }}
    >
      <video
        ref={videoRef}
        autoPlay
        muted
        loop
        playsInline
        webkit-playsinline="true"
        preload="auto"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          pointerEvents: "none",
          transform: "translate3d(0, 0, 0)",
          backfaceVisibility: "hidden",
          willChange: "transform",
        }}
      >
        <source src="/wallpapers/skeleton/skeleton-warrior.mp4" type="video/mp4" />
      </video>
      {/* Cinematic dark overlay to ensure maximum text readability across all chat components */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.55) 100%), linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, transparent 25%, transparent 75%, rgba(0,0,0,0.65) 100%)",
        }}
      />
    </div>
  );
}

