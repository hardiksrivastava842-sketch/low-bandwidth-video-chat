// Presentation-only graphics. No call logic lives here.

const I = ({ children, size = 20 }) => (
  <svg
    className="icon"
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

export const IconDice = () => (
  <I>
    <rect x="4" y="4" width="16" height="16" rx="3.5" />
    <circle cx="9" cy="9" r="1" fill="currentColor" />
    <circle cx="15" cy="15" r="1" fill="currentColor" />
    <circle cx="15" cy="9" r="1" fill="currentColor" />
    <circle cx="9" cy="15" r="1" fill="currentColor" />
  </I>
);
export const IconLink = () => (
  <I>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
  </I>
);
export const IconJoin = () => (
  <I>
    <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
    <path d="M10 8l4 4-4 4M14 12H4" />
  </I>
);
export const IconMic = () => (
  <I size={22}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
  </I>
);
export const IconMicOff = () => (
  <I size={22}>
    <path d="M3 3l18 18" />
    <path d="M9 9v2a3 3 0 0 0 5 2.2M15 9.5V6a3 3 0 0 0-5.7-1.3" />
    <path d="M5 11a7 7 0 0 0 11.2 5.6M19 11a7 7 0 0 1-.6 2.8M12 18v3" />
  </I>
);
export const IconVideo = () => (
  <I size={22}>
    <rect x="3" y="6" width="12" height="12" rx="3" />
    <path d="M15 10.5l6-3.5v10l-6-3.5" />
  </I>
);
export const IconPhoneOff = () => (
  <I size={22}>
    <path d="M4 15c4.500-4 11.500-4 16 0l-1.600 2.600a1 1 0 0 1-1.300.4l-2.200-1a1 1 0 0 1-.6-1v-1.200a8 8 0 0 0-6.600 0v1.200a1 1 0 0 1-.6 1l-2.200 1a1 1 0 0 1-1.300-.4z" />
  </I>
);

// Brand mark
export const Logo = () => (
  <svg width="34" height="34" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="9" fill="var(--accent)" />
    <rect x="6.5" y="10" width="13" height="12" rx="3" fill="#06141c" />
    <path d="M21 14l5-3v10l-5-3z" fill="#06141c" />
    <path d="M10 17.5a3 3 0 0 1 6 0" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" fill="none" />
    <circle cx="13" cy="19.6" r="1" fill="var(--accent)" />
  </svg>
);

// Derives 0-4 bars from the text the app already shows (e.g. "850 Kbps", "1.2 Mbps")
export function speedLevel(text) {
  const m = /([\d.]+)\s*(Kbps|Mbps)/i.exec(text || "");
  if (!m) return 0;
  const kbps = parseFloat(m[1]) * (m[2].toLowerCase() === "mbps" ? 1000 : 1);
  if (kbps >= 1000) return 4;
  if (kbps >= 500) return 3;
  if (kbps >= 150) return 2;
  return kbps > 0 ? 1 : 0;
}

export const SignalBars = ({ level }) => (
  <svg className="bars" width="22" height="18" viewBox="0 0 22 18" aria-hidden="true">
    {[0, 1, 2, 3].map((i) => (
      <rect
        key={i}
        x={i * 6}
        y={14 - i * 4.4}
        width="4"
        height={4 + i * 4.4}
        rx="1.2"
        className={i < level ? "bar on" : "bar"}
      />
    ))}
  </svg>
);

// Header illustration: two devices linked by a signal path with a moving packet
export const HeroArt = () => (
  <svg className="hero-art" viewBox="0 0 420 180" role="img" aria-label="Two devices connected by a stable signal">
    <defs>
      <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="var(--panel-2)" />
        <stop offset="1" stopColor="var(--panel)" />
      </linearGradient>
    </defs>
    {/* left device */}
    <rect x="14" y="34" width="124" height="88" rx="12" fill="url(#tile)" stroke="var(--line)" />
    <circle cx="76" cy="68" r="14" fill="var(--line)" />
    <path d="M46 108c4-14 14-20 30-20s26 6 30 20" fill="var(--line)" />
    <rect x="46" y="130" width="60" height="6" rx="3" fill="var(--line)" />
    {/* right device */}
    <rect x="282" y="34" width="124" height="88" rx="12" fill="url(#tile)" stroke="var(--line)" />
    <circle cx="344" cy="68" r="14" fill="var(--accent)" opacity=".85" />
    <path d="M314 108c4-14 14-20 30-20s26 6 30 20" fill="var(--accent)" opacity=".85" />
    <rect x="314" y="130" width="60" height="6" rx="3" fill="var(--line)" />
    {/* link */}
    <path id="route" d="M142 78C190 40 232 116 278 78" fill="none" stroke="var(--line)" strokeWidth="2" />
    <path className="flow" d="M142 78C190 40 232 116 278 78" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="4 10" />
    <circle r="4.5" fill="var(--accent)">
      <animateMotion dur="2.6s" repeatCount="indefinite">
        <mpath href="#route" />
      </animateMotion>
    </circle>
    {/* signal bars under the link */}
    {[0, 1, 2, 3].map((i) => (
      <rect key={i} x={188 + i * 9} y={148 - i * 5} width="5" height={8 + i * 5} rx="1.5" fill="var(--accent)" opacity={0.35 + i * 0.2} />
    ))}
  </svg>
);

export const PersonArt = ({ off }) => (
  <svg className={off ? "person off" : "person"} width="120" height="120" viewBox="0 0 120 120" aria-hidden="true">
    <circle className="ring r1" cx="60" cy="60" r="34" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    <circle className="ring r2" cx="60" cy="60" r="34" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
    <circle cx="60" cy="60" r="34" fill="var(--panel-2)" stroke="var(--line)" />
    <circle cx="60" cy="52" r="9" fill="var(--muted)" />
    <path d="M42 80c3-10 10-14 18-14s15 4 18 14" fill="var(--muted)" />
  </svg>
);
