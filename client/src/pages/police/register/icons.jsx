// Icons from the "Active Case Files Register" design.
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
