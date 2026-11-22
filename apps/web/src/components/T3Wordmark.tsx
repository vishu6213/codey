import type { SVGProps } from "react";

export function CodeyWordmark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
      <defs>
        <linearGradient id="codeyWordmarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FF385C" />
          <stop offset="100%" stopColor="#B30021" />
        </linearGradient>
      </defs>
      {/* Outer stylized C */}
      <path
        d="M 72 24 C 63 17 52 14 40 17 C 24 21 13 34 11 50 C 9 66 18 80 32 87 C 43 92 56 91 68 83 C 71 81 72 77 69 74 C 66 71 62 71 59 73 C 49 79 38 79 30 75 C 20 70 15 58 17 46 C 19 35 28 26 39 24 C 47 22 55 24 61 29 C 64 31 68 31 71 28 C 73 25 74 22 72 24 Z"
        fill="url(#codeyWordmarkGrad)"
      />
      {/* Code slash */}
      <path
        d="M 58 26 L 40 74 C 39 77 41 79 43 80 C 46 81 49 79 50 76 L 68 28 C 69 25 67 23 65 22 C 62 21 59 23 58 26 Z"
        fill="#FF2A4D"
      />
      {/* Code chevron > */}
      <path
        d="M 64 42 L 74 50 L 64 58 C 62 60 62 63 64 65 C 66 67 69 67 71 65 L 83 55 C 85 53 85 47 83 45 L 71 35 C 69 33 66 33 64 35 C 62 37 62 40 64 42 Z"
        fill="url(#codeyWordmarkGrad)"
      />
    </svg>
  );
}

export const T3Wordmark = CodeyWordmark;

