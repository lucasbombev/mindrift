const paths = {
  home: (
    <>
      <path d="M3 10.8 12 3l9 7.8" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </>
  ),
  history: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  chart: (
    <>
      <path d="M4 20V11" />
      <path d="M10 20V4" />
      <path d="M16 20v-6" />
      <path d="M22 20H2" />
    </>
  ),
  cash: (
    <>
      <rect x="2.5" y="6.5" width="19" height="12" rx="2.5" />
      <circle cx="12" cy="12.5" r="2.6" />
      <path d="M6 10h.01M18 15h.01" />
    </>
  ),
  cart: (
    <>
      <path d="M4 15h15.5l1-5H7" />
      <path d="M4 6h2l2.5 9" />
      <circle cx="8.5" cy="19" r="1.8" />
      <circle cx="17" cy="19" r="1.8" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3.5 20v-1.5A5 5 0 0 1 8.5 13h1a5 5 0 0 1 5 5.5V20" />
      <path d="M16 5.2a3.2 3.2 0 0 1 0 5.6" />
      <path d="M17.5 13.5a4.5 4.5 0 0 1 3 4.2V20" />
    </>
  ),
  settings: (
    <>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="12" cy="12" r="1" fill="currentColor" />
      <circle cx="19" cy="12" r="1" fill="currentColor" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  timer: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4.5l2.5 1.5M9 2h6M12 2v3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 11a8 8 0 1 0-2.3 5.7" />
      <path d="M20 4v7h-7" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
  check: <path d="m4.5 12.5 5 5L20 6.5" />,
  camera: (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3v11H4Z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13" />
      <path d="M10 11v5M14 11v5" />
    </>
  ),
  edit: (
    <>
      <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
      <path d="M14.5 5.5l3 3" />
    </>
  ),
  logout: (
    <>
      <path d="M14 4h5v16h-5" />
      <path d="M10 8l-4 4 4 4M6 12h9" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevronRight: <path d="m9 5 7 7-7 7" />,
  chevronDown: <path d="m5 9 7 7 7-7" />,
  chevronLeft: <path d="m15 5-7 7 7 7" />,
  alert: (
    <>
      <path d="M12 3 2.8 20h18.4L12 3Z" />
      <path d="M12 9v5M12 17.2v.1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.1" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0" />
      <path d="M6 12.5a9 9 0 0 1 12 0" />
      <path d="M9.5 16a4 4 0 0 1 5 0" />
      <path d="M12 19.5v.1" />
    </>
  ),
  wifiOff: (
    <>
      <path d="M2.5 9a14 14 0 0 1 19 0" />
      <path d="M6 12.5a9 9 0 0 1 12 0" />
      <path d="M9.5 16a4 4 0 0 1 5 0" />
      <path d="M12 19.5v.1" />
      <path d="m3 3 18 18" />
    </>
  ),
  sound: (
    <>
      <path d="M4 9.5h4l5-4v13l-5-4H4Z" />
      <path d="M16.5 9a4.2 4.2 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" />
    </>
  ),
  soundOff: (
    <>
      <path d="M4 9.5h4l5-4v13l-5-4H4Z" />
      <path d="m16.5 9.5 5 5M21.5 9.5l-5 5" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </>
  ),
  print: (
    <>
      <path d="M7 8V3h10v5" />
      <rect x="4" y="8" width="16" height="8" rx="2" />
      <path d="M7 14h10v7H7z" />
    </>
  ),
  key: (
    <>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9M18 12v4M15 12v3" />
    </>
  ),
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  filter: <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />,
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="16" rx="2.5" />
      <path d="M8 3v4M16 3v4M3.5 10h17" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21v-1a6.5 6.5 0 0 1 6.5-6.5h2a6.5 6.5 0 0 1 6.5 6.5v1" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" />
      <path d="M8 5H4v2a4 4 0 0 0 4 4M16 5h4v2a4 4 0 0 1-4 4M12 12v5M8 21h8M9 17h6v4H9z" />
    </>
  ),
  trendUp: (
    <>
      <path d="m3 17 6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  arrowLeft: <path d="M20 12H4M10 6l-6 6 6 6" />,
  arrowRight: <path d="M4 12h16M14 6l6 6-6 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  banknote: (
    <>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 9.5v.1M18 14.5v.1" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  install: (
    <>
      <path d="M12 3v11M8 10l4 4 4-4" />
      <path d="M5 17v3h14v-3" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M3 3l18 18" />
      <path d="M10.6 6.2A10.9 10.9 0 0 1 12 6c6 0 9.5 6 9.5 6a17 17 0 0 1-3 3.7M6.4 7.6C4 9.4 2.5 12 2.5 12s3.5 6 9.5 6a10 10 0 0 0 4.2-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
};

export function Icon({ name, size = 22, strokeWidth = 2, className = '', fill = 'none' }) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name] || paths.info}
    </svg>
  );
}

export function Logo({ size = 44, withWordmark = false, className = '' }) {
  return (
    <span className={`logo ${className}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label="Drift Rent"
        style={{ flex: '0 0 auto', borderRadius: size * 0.26, display: 'block' }}
      >
        <rect width="64" height="64" rx="16" fill="#0b1220" />
        <path d="M9 27h9M6 34h9M12 41h7" stroke="#fbbf24" strokeWidth="2.6" strokeLinecap="round" />
        <path
          d="M21 39c1.5-5.6 5.2-9 10.9-9h5.6l5.2 5.2h5.8c1.4 0 2.5 1.1 2.5 2.5v3.8c0 1.4-1.1 2.5-2.5 2.5H23.5c-1.8 0-3-1.5-2.5-3.2Z"
          fill="#f97316"
        />
        <circle cx="26" cy="46" r="6" fill="#e5e7eb" stroke="#0b1220" strokeWidth="3" />
        <circle cx="47" cy="46" r="6" fill="#e5e7eb" stroke="#0b1220" strokeWidth="3" />
        <circle cx="40" cy="25" r="5.2" fill="#fbbf24" />
        <path d="M37.5 24.5h5" stroke="#0b1220" strokeWidth="2" strokeLinecap="round" />
        <path d="M31 39h4" stroke="#0b1220" strokeWidth="2" strokeLinecap="round" opacity=".5" />
      </svg>
      {withWordmark && (
        <span className="logo__wordmark">
          <strong>Drift Rent</strong>
          <span>GESTÃO DE PISTA</span>
        </span>
      )}
    </span>
  );
}
