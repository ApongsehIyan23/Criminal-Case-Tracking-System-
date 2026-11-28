// Icons from the "Digital Case Initiation" design.
const BLUE = '#2563eb';

// The light blue circle above each step title; `children` is the step's symbol.
const Circle = ({ children }) => (
  <svg width="36" height="36" viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <circle cx="18" cy="18" r="16" fill="#e0f2fe" stroke="#bae6fd" strokeWidth="1.5" />
    {children}
  </svg>
);

export const IncidentIcon = () => (
  <Circle><path d="M13 18h10M18 13v10" stroke={BLUE} strokeWidth="2" strokeLinecap="round" /></Circle>
);

export const NarrativeIcon = () => (
  <Circle><path d="M12 14h12M12 18h8M12 22h10" stroke={BLUE} strokeWidth="2" strokeLinecap="round" /></Circle>
);

export const ParticipantsIcon = () => (
  <Circle>
    <circle cx="14" cy="15" r="3" stroke={BLUE} strokeWidth="1.8" />
    <circle cx="22" cy="15" r="3" stroke={BLUE} strokeWidth="1.8" />
    <path d="M9 25c0-2.8 2.2-5 5-5M22 20c2.8 0 5 2.2 5 5" stroke={BLUE} strokeWidth="1.8" strokeLinecap="round" />
  </Circle>
);

export const ReviewIcon = () => (
  <Circle><path d="M13 18l4 4 6-8" stroke={BLUE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></Circle>
);

export const DoneIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M4 8l3 3 5-6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const PlusIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
    <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

export const DocketIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M3 3h4v4H3zM9 3h4v4H9zM3 9h4v4H3zM9 9h4v4H9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);
