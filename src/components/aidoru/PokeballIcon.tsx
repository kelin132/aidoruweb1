import type { SVGProps } from "react";

export function PokeballIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="9" fill="#ef5266" />
      <path d="M3 12a9 9 0 0 0 18 0H3Z" fill="#f8fafc" />
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.6" />
      <path d="M3 12h18" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3" fill="#f8fafc" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
    </svg>
  );
}
