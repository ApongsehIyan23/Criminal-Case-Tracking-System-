// Outlined icon family from the sidebar design: 16x16 view box, 1.5 stroke.
const Svg = ({ size = 16, children }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true" className="shrink-0">{children}</svg>
);
const stroke = { stroke: 'currentColor', strokeWidth: 1.5 };

export function DashboardIcon({ size, active }) {
  const paint = active ? { fill: 'currentColor' } : stroke;
  return (
    <Svg size={size}>
      {[[1, 1], [9, 1], [1, 9], [9, 9]].map(([x, y]) => <rect key={`${x}-${y}`} x={x} y={y} width="6" height="6" rx="1.5" {...paint} />)}
    </Svg>
  );
}

export const CasesIcon = ({ size }) => (
  <Svg size={size}>
    <path d="M3 3h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4a1 1 0 011-1z" {...stroke} />
    <path d="M5 3V2a1 1 0 011-1h4a1 1 0 011 1v1" {...stroke} />
  </Svg>
);

export const EvidenceIcon = ({ size }) => (
  <Svg size={size}>
    <path d="M9 1H4a1 1 0 00-1 1v12a1 1 0 001 1h8a1 1 0 001-1V5L9 1z" {...stroke} />
    <path d="M9 1v4h4" {...stroke} />
  </Svg>
);

export const NewCaseIcon = ({ size }) => (
  <Svg size={size}>
    <rect x="2" y="2" width="12" height="12" rx="2" {...stroke} />
    <path d="M8 5v6M5 8h6" {...stroke} strokeLinecap="round" />
  </Svg>
);

export const GlobeIcon = ({ size }) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="6" {...stroke} />
    <ellipse cx="8" cy="8" rx="3" ry="6" {...stroke} />
    <path d="M2 8h12" {...stroke} />
  </Svg>
);

export const ClockIcon = ({ size }) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="6" {...stroke} />
    <path d="M8 3v5l3 2" {...stroke} strokeLinecap="round" />
  </Svg>
);

export const HelpIcon = ({ size }) => (
  <Svg size={size}>
    <circle cx="8" cy="8" r="6" {...stroke} />
    <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="9" fontWeight="600">?</text>
  </Svg>
);

export const LogOutIcon = ({ size }) => (
  <Svg size={size}>
    <path d="M10 13l3-3-3-3" {...stroke} strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 10H6a3 3 0 01-3-3V4" {...stroke} strokeLinecap="round" />
  </Svg>
);

export const CollapseIcon = () => (
  <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
    <rect x="2" y="2" width="14" height="14" rx="3" stroke="#fff" strokeWidth="1.5" />
    <rect x="6" y="2" width="6" height="14" rx="1" stroke="#fff" strokeWidth="1.5" />
  </svg>
);

export const Logo = ({ large }) => (large ? (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect width="24" height="24" rx="6" fill="#6366f1" />
    <path d="M12 5L6 8.5v7L12 19l6-3.5v-7L12 5z" stroke="#fff" strokeWidth="1.3" />
    <path d="M12 12v7M6 8.5l6 3.5 6-3.5" stroke="#fff" strokeWidth="1.3" />
  </svg>
) : (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
    <rect width="20" height="20" rx="4" fill="#6366f1" />
    <path d="M10 4L5 7v6l5 3 5-3V7l-5-3z" stroke="#fff" strokeWidth="1.2" />
    <path d="M10 10v6M5 7l5 3 5-3" stroke="#fff" strokeWidth="1.2" />
  </svg>
));

export const Avatar = () => (
  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#555]">
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="8" r="3.5" fill="#888" />
      <ellipse cx="10" cy="17" rx="6" ry="4" fill="#888" />
    </svg>
  </span>
);

export const ChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true" className="shrink-0">
    <path d="M5 3l4 4-4 4" stroke="rgba(255,255,255,0.4)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
