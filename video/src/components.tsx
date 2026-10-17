import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig, Easing } from 'remotion';
import { C, FONT } from './theme';

/** True for the 9:16 composition. Scenes stack text over the visual when it is. */
export const usePortrait = () => {
  const { width, height } = useVideoConfig();
  return height > width;
};

/** Spring from 0 to 1 starting at `delay` frames. */
export const usePop = (delay = 0, damping = 200, durationInFrames?: number) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping }, durationInFrames });
};

export const inr = (n: number, decimals = 0) =>
  '₹' + n.toLocaleString('en-IN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });

/** Dark hero background: the app's blue and peach glows, drifting slowly. */
export const GlowBg: React.FC<{ hue?: 'blue' | 'gold' }> = ({ hue = 'blue' }) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 45) * 6;
  const top = hue === 'gold' ? 'rgba(213,169,78,0.30)' : 'rgba(61,134,255,0.32)';
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(70% 80% at ${88 + drift}% ${4 - drift}%, ${top}, transparent 60%)`,
          `radial-gradient(60% 75% at ${6 - drift}% ${104 + drift}%, rgba(237,152,97,0.22), transparent 62%)`,
          `linear-gradient(165deg, #1A1B1F 0%, ${C.canvas} 65%)`,
        ].join(', '),
      }}
    />
  );
};

/** Words rise and unblur one after another. `accent` maps a word to its colour. */
export const Words: React.FC<{
  text: string;
  size: number;
  delay?: number;
  stagger?: number;
  weight?: number;
  color?: string;
  accent?: Record<string, string>;
  align?: 'left' | 'center';
  lineHeight?: number;
}> = ({ text, size, delay = 0, stagger = 3, weight = 500, color = C.ink, accent = {}, align = 'left', lineHeight = 1.04 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: weight,
        lineHeight,
        letterSpacing: '-0.025em',
        color,
        textAlign: align,
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        columnGap: size * 0.24,
      }}
    >
      {text.split(' ').map((w, i) => {
        const p = spring({ frame: frame - delay - i * stagger, fps, config: { damping: 18, mass: 0.6 } });
        const o = interpolate(frame - delay - i * stagger, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: o,
              transform: `translateY(${(1 - p) * size * 0.45}px)`,
              filter: `blur(${(1 - o) * 14}px)`,
              color: accent[w.replace(/[.,]/g, '')] ?? undefined,
            }}
          >
            {w}
          </span>
        );
      })}
    </div>
  );
};

/** A supporting line that fades up as one piece. */
export const Sub: React.FC<{ children: React.ReactNode; size: number; delay?: number; align?: 'left' | 'center'; color?: string }> = ({
  children,
  size,
  delay = 0,
  align = 'left',
  color = C.muted,
}) => {
  const p = usePop(delay);
  return (
    <div
      style={{
        fontFamily: FONT,
        fontSize: size,
        fontWeight: 400,
        lineHeight: 1.3,
        color,
        textAlign: align,
        opacity: p,
        transform: `translateY(${(1 - p) * 40}px)`,
      }}
    >
      {children}
    </div>
  );
};

/** Text on one side, visual on the other (16:9), or text over visual (9:16). */
export const Split: React.FC<{ text: React.ReactNode; visual: React.ReactNode; textWidth?: number }> = ({ text, visual, textWidth = 1500 }) => {
  const portrait = usePortrait();
  if (portrait) {
    return (
      <AbsoluteFill style={{ flexDirection: 'column', alignItems: 'center', padding: '380px 180px 0' }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 56 }}>{text}</div>
        <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{visual}</div>
      </AbsoluteFill>
    );
  }
  return (
    <AbsoluteFill style={{ flexDirection: 'row', alignItems: 'center', padding: '0 280px' }}>
      <div style={{ width: textWidth, display: 'flex', flexDirection: 'column', gap: 56 }}>{text}</div>
      <div style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{visual}</div>
    </AbsoluteFill>
  );
};

/** A phone bezel around a real app capture (1170x2532). */
export const Phone: React.FC<{ src: string; height: number; style?: React.CSSProperties; children?: React.ReactNode }> = ({ src, height, style, children }) => {
  const width = (height * 1170) / 2532;
  const bezel = height * 0.018;
  const radius = height * 0.075;
  return (
    <div
      style={{
        position: 'relative',
        width: width + bezel * 2,
        height: height + bezel * 2,
        padding: bezel,
        borderRadius: radius + bezel,
        background: 'linear-gradient(145deg, #3A3A40, #121214 40%, #2A2A2F)',
        boxShadow: `0 ${height * 0.05}px ${height * 0.12}px rgba(0,0,0,0.55), 0 0 0 2px rgba(255,255,255,0.06) inset`,
        ...style,
      }}
    >
      <div style={{ width, height, borderRadius: radius, overflow: 'hidden', position: 'relative', background: C.canvas }}>
        <Img src={staticFile(src)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        {children}
      </div>
    </div>
  );
};

/** The Khazana mark. `dark` is the variant made for dark backgrounds. */
export const Mark: React.FC<{ size: number; style?: React.CSSProperties }> = ({ size, style }) => (
  <Img src={staticFile('brand/khazana-mark-dark.svg')} style={{ width: size, height: size, ...style }} />
);

/** Counts up from 0 to `value`, easing out, between frames `from` and `to`. */
export const Counter: React.FC<{ value: number; from: number; to: number; size: number; decimals?: number; color?: string }> = ({
  value,
  from,
  to,
  size,
  decimals = 0,
  color = C.ink,
}) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  return (
    <div style={{ fontFamily: FONT, fontSize: size, fontWeight: 400, color, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
      {inr(Math.round(value * t), decimals)}
    </div>
  );
};

/** The app's 270° score gauge, filled to `value`/100 by frame `to`. */
export const ScoreRing: React.FC<{ value: number; from: number; to: number; size: number; label: string }> = ({ value, from, to, size, label }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [from, to], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic) });
  const r = 42;
  const arc = 2 * Math.PI * r * 0.75;
  const shown = Math.round(value * t);
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg viewBox="0 0 100 100" width={size} height={size} style={{ transform: 'rotate(135deg)', overflow: 'visible' }}>
        <defs>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <linearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#6FA6FF" />
            <stop offset="1" stopColor={C.blue} />
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r={r} fill="none" stroke="#2A2A30" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${arc} 999`} />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(arc * value * t) / 100} 999`}
          filter="url(#glow)"
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: FONT }}>
        <div style={{ fontSize: size * 0.3, fontWeight: 300, color: C.ink, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{shown}</div>
        <div style={{ fontSize: size * 0.065, color: C.muted, marginTop: size * 0.03, opacity: t }}>{label}</div>
      </div>
    </div>
  );
};

/** Rounded dark card, the app's surface style. */
export const Card: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <div
    style={{
      background: `linear-gradient(180deg, ${C.cardHi}, ${C.card})`,
      border: `2px solid ${C.line}`,
      borderRadius: 72,
      boxShadow: '0 60px 140px rgba(0,0,0,0.45)',
      fontFamily: FONT,
      ...style,
    }}
  >
    {children}
  </div>
);

/** Lucide-style stroke icon (24x24 viewBox). */
export const Icon: React.FC<{ d: string[]; size: number; color?: string }> = ({ d, size, color = C.ink }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    {d.map((p, i) => (
      <path key={i} d={p} />
    ))}
  </svg>
);

// Paths from lucide (ISC), the icon set the app uses.
export const ICONS = {
  lock: ['M5 11h14a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2z', 'M7 11V7a5 5 0 0 1 10 0v4'],
  shield: [
    'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
    'm9 12 2 2 4-4',
  ],
  wifiOff: [
    'M12 20h.01',
    'M8.5 16.429a5 5 0 0 1 7 0',
    'M5 12.859a10 10 0 0 1 5.17-2.69',
    'M19 12.859a10 10 0 0 0-2.007-1.523',
    'M2 8.82a15 15 0 0 1 4.177-2.643',
    'M22 8.82a15 15 0 0 0-11.288-3.764',
    'm2 2 20 20',
  ],
  sparkles: [
    'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  ],
  basket: ['m15 11-1 9', 'm19 11-4-7', 'M2 11h20', 'm3.5 11 1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4', 'M4.5 15.5h15', 'm5 11 4-7', 'm9 11 1 9'],
  check: ['M20 6 9 17l-5-5'],
};
