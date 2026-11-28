// Icons from the data table designs.
const Svg = ({ size = 16, children }) => (
  <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} fill="none" aria-hidden="true" className="shrink-0">
    {children}
  </svg>
);
const LINE = { stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round' };

export const FolderIcon = () => (
  <Svg>
    <path d="M2 4l2-2h8l2 2v10a1 1 0 01-1 1H3a1 1 0 01-1-1V4z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 4h12" stroke="currentColor" strokeWidth="1.5" />
  </Svg>
);

export const ClockIcon = () => (
  <Svg><circle cx="8" cy="8" r="6" {...LINE} /><path d="M8 5v3l2 1.5" {...LINE} /></Svg>
);

export const BookmarkIcon = () => (
  <Svg><path d="M3 13V3a1 1 0 011-1h8a1 1 0 011 1v10l-5-2.5L3 13z" stroke="currentColor" strokeWidth="1.5" /></Svg>
);

export const CheckCircleIcon = () => (
  <Svg><circle cx="8" cy="8" r="6" {...LINE} /><path d="M4 8l3 3 5-6" {...LINE} strokeLinejoin="round" /></Svg>
);

export const SortIcon = () => <Svg size={14}><path d="M2 4h10M4 7h6M6 10h2" {...LINE} /></Svg>;
export const FilterIcon = () => <Svg size={14}><path d="M2 3h10M2 7h6M2 11h3" {...LINE} /></Svg>;

export const SearchIcon = () => (
  <Svg>
    <circle cx="7" cy="7" r="5" stroke="#9ca3af" strokeWidth="1.5" />
    <path d="M11 11l3 3" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" />
  </Svg>
);

export const PersonIcon = () => (
  <Svg size={12}>
    <circle cx="6" cy="4.5" r="2.5" stroke="#9ca3af" strokeWidth="1.2" />
    <path d="M2 11c0-2.2 1.8-4 4-4s4 1.8 4 4" stroke="#9ca3af" strokeWidth="1.2" strokeLinecap="round" />
  </Svg>
);

export const DotsIcon = () => (
  <Svg>
    {[3, 8, 13].map((y) => <circle key={y} cx="8" cy={y} r="1.2" fill="#9ca3af" />)}
  </Svg>
);

export const ChevronLeftIcon = () => (
  <Svg size={14}><path d="M9 3L5 7l4 4" {...LINE} strokeLinejoin="round" /></Svg>
);
export const ChevronRightIcon = () => (
  <Svg size={14}><path d="M5 3l4 4-4 4" {...LINE} strokeLinejoin="round" /></Svg>
);

export const EnvelopeIcon = () => (
  <Svg>
    <rect x="2" y="3" width="12" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 5l6 4 6-4" stroke="currentColor" strokeWidth="1.5" />
  </Svg>
);

export const PeopleIcon = () => (
  <Svg>
    <circle cx="6" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="11" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M1 14c0-2.8 2.2-5 5-5M10 9c2.8 0 5 2.2 5 5" {...LINE} />
  </Svg>
);

export const PersonPlusIcon = () => (
  <Svg>
    <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M2 14c0-2.8 2.2-5 5-5" {...LINE} />
    <path d="M12 7v4M10 9h4" {...LINE} />
  </Svg>
);

export const InspectIcon = () => (
  <Svg size={14}>
    <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.3" />
    <path d="M5 7h4M7 5v4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
  </Svg>
);

export const LockIcon = () => (
  <Svg size={12}>
    <rect x="2" y="4" width="8" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
    <path d="M4 4V3a2 2 0 014 0v1" stroke="currentColor" strokeWidth="1.2" />
  </Svg>
);

export const RefreshIcon = () => <Svg size={14}><path d="M7 2v10M2 7a5 5 0 019.6-1.5" {...LINE} /></Svg>;

export const ExportIcon = () => (
  <Svg size={14}>
    <path d="M7 2v6l3 2" {...LINE} />
    <rect x="2" y="2" width="10" height="10" rx="2" stroke="currentColor" strokeWidth="1.5" />
  </Svg>
);
