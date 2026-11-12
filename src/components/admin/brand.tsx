/*
 * Racing Legends brand marks for Race Control: the website's emblem (apps/web/public/logo.svg) inlined so
 * it renders crisp at any size, plus the RACING / LEGENDS wordmark lockup used on the sign-in screen.
 */
import { useId } from "react";

function Defs({ p }: { p: string }) {
  return (
    <defs>
      <linearGradient id={`${p}-chrome`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffffff" />
        <stop offset=".34" stopColor="#c6d0da" />
        <stop offset=".5" stopColor="#7f8a96" />
        <stop offset=".53" stopColor="#565f6a" />
        <stop offset=".72" stopColor="#b4bec8" />
        <stop offset="1" stopColor="#eef3f8" />
      </linearGradient>
      <linearGradient id={`${p}-red`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ff8585" />
        <stop offset=".46" stopColor="#e01b1b" />
        <stop offset=".54" stopColor="#9f0000" />
        <stop offset="1" stopColor="#ff5151" />
      </linearGradient>
      <path id={`${p}-ring`} d="M52 52 m-35 0 a35 35 0 1 1 70 0 a35 35 0 1 1 -70 0" />
    </defs>
  );
}

function EmblemShapes({ p }: { p: string }) {
  return (
    <g>
      <circle cx="52" cy="52" r="49" fill="#0e1218" stroke={`url(#${p}-chrome)`} strokeWidth="3" />
      <circle cx="52" cy="52" r="29" fill="#121722" stroke={`url(#${p}-red)`} strokeWidth="3" />
      <g fill="#eef2f7">
        <rect x="35.5" y="27" width="5.6" height="5.6" />
        <rect x="46.7" y="27" width="5.6" height="5.6" />
        <rect x="57.9" y="27" width="5.6" height="5.6" />
        <rect x="41.1" y="32.6" width="5.6" height="5.6" />
        <rect x="52.3" y="32.6" width="5.6" height="5.6" />
      </g>
      <text x="52" y="71" textAnchor="middle" fontFamily="'Saira Condensed','Arial Narrow',sans-serif" fontWeight="800" fontStyle="italic" fontSize="36" fill={`url(#${p}-chrome)`}>
        RL
      </text>
      <text fontFamily="'Oswald','Arial Narrow',sans-serif" fontWeight="600" fontSize="9.4" letterSpacing="2.3" fill="#aeb8c4">
        <textPath href={`#${p}-ring`} startOffset="2%">
          {"RACING LEGENDS · EST 2026 · "}
        </textPath>
      </text>
    </g>
  );
}

export function Emblem({ className }: { className?: string }) {
  const p = `rl${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 104 104" className={className} aria-hidden="true">
      <Defs p={p} />
      <EmblemShapes p={p} />
    </svg>
  );
}

/** Emblem + RACING / LEGENDS wordmark (sign-in screen). */
export function Lockup({ className }: { className?: string }) {
  const p = `rl${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 468 104" className={className} role="img" aria-label="Racing Legends">
      <Defs p={p} />
      <EmblemShapes p={p} />
      <text x="124" y="45" fontFamily="'Oswald','Arial Narrow',sans-serif" fontWeight="700" fontSize="21" letterSpacing="9.5" fill={`url(#${p}-chrome)`}>
        RACING
      </text>
      <rect x="126" y="53" width="214" height="3" fill={`url(#${p}-red)`} />
      <text x="122" y="92" fontFamily="'Saira Condensed','Arial Narrow',sans-serif" fontWeight="800" fontStyle="italic" fontSize="44" letterSpacing="1" fill={`url(#${p}-red)`} stroke="#f0f4f8" strokeWidth=".4">
        LEGENDS
      </text>
    </svg>
  );
}
