import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from 'remotion';
import { C, FONT } from './theme';
import { Card, Counter, GlowBg, ICONS, Icon, Mark, Phone, ScoreRing, Split, Sub, Words, inr, usePop, usePortrait } from './components';

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

// Sample figures are the app's own deterministic sample data, as captured in
// public/screens (Settings → Load sample data), so the ad matches the product.

/** 1 · Hook: the problem, with "bank login" struck through. */
export const S1Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const size = portrait ? 230 : 250;
  const strike = interpolate(frame, [52, 66], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  return (
    <AbsoluteFill>
      <GlowBg />
      <AbsoluteFill style={{ justifyContent: 'center', padding: portrait ? '0 180px' : '0 320px', gap: 70 }}>
        <Words text="Most finance apps" size={size} stagger={3} />
        <div style={{ display: 'flex', flexWrap: 'wrap', columnGap: size * 0.24, alignItems: 'baseline' }}>
          <Words text="want your" size={size} delay={9} stagger={3} />
          <div style={{ position: 'relative' }}>
            <Words text="bank login." size={size} delay={15} stagger={3} color={C.expense} />
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: '52%',
                height: size * 0.07,
                width: `${strike * 100}%`,
                background: C.ink,
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 2 · The turn: the mark locks in like a vault dial. */
export const S2Turn: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const lock = usePop(0, 14);
  const dialTurn = interpolate(frame, [0, 34], [-200, 0], { ...clamp, easing: Easing.out(Easing.back(1.4)) });
  const click = interpolate(frame, [34, 38, 46], [1, 1.06, 1], clamp);
  const sheen = interpolate(frame, [38, 70], [-120, 220], clamp);
  const mark = portrait ? 760 : 640;
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <AbsoluteFill>
      <GlowBg hue="gold" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: 110 }}>
        <div style={{ position: 'relative', width: mark * 1.5, height: mark * 1.5, transform: `scale(${(0.6 + lock * 0.4) * click})`, opacity: lock }}>
          <svg viewBox="-100 -100 200 200" width="100%" height="100%" style={{ position: 'absolute', inset: 0, transform: `rotate(${dialTurn}deg)` }}>
            <circle r="96" fill="none" stroke="rgba(213,169,78,0.35)" strokeWidth="1.2" />
            {ticks.map((i) => (
              <line
                key={i}
                x1="0"
                y1={-96}
                x2="0"
                y2={i % 5 === 0 ? -86 : -91}
                stroke={i % 5 === 0 ? C.gold : 'rgba(213,169,78,0.4)'}
                strokeWidth={i % 5 === 0 ? 1.6 : 0.8}
                transform={`rotate(${i * 6})`}
              />
            ))}
          </svg>
          <div
            style={{
              position: 'absolute',
              inset: mark * 0.25,
              borderRadius: '50%',
              background: 'radial-gradient(circle at 50% 40%, #1E1F24, #0B0B0D 70%)',
              boxShadow: `0 0 0 3px rgba(213,169,78,0.25), 0 40px 120px rgba(0,0,0,0.6)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            <Mark size={mark * 0.72} />
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: `linear-gradient(105deg, transparent ${sheen - 30}%, rgba(255,236,190,0.35) ${sheen}%, transparent ${sheen + 30}%)`,
                mixBlendMode: 'screen',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 44, padding: '0 160px' }}>
          <Words text="Khazana doesn't." size={portrait ? 220 : 210} delay={36} align="center" accent={{ Khazana: C.goldHi }} />
          <Sub size={portrait ? 84 : 78} delay={52} align="center">
            Your money stays on your device. Encrypted. Nowhere else.
          </Sub>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** 3 · Quick add: plain words typed, parsed into a ledger entry. */
export const S3QuickAdd: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const phrase = 'spent 450 on groceries at bigbasket';
  const typed = Math.round(interpolate(frame, [14, 62], [0, phrase.length], clamp));
  const caretOn = frame < 70 && Math.floor(frame / 8) % 2 === 0;
  const press = interpolate(frame, [68, 72, 78], [1, 0.92, 1], clamp);
  const result = usePop(78, 16);
  const cardIn = usePop(4, 20);
  const w = portrait ? 1800 : 1720;
  return (
    <AbsoluteFill>
      <GlowBg />
      <Split
        textWidth={1350}
        text={
          <>
            <Words text="Just type it." size={portrait ? 210 : 200} />
            <Sub size={portrait ? 84 : 76} delay={10}>
              Write it the way you'd say it. Khazana turns it into a proper ledger entry.
            </Sub>
          </>
        }
        visual={
          <div style={{ width: w, display: 'flex', flexDirection: 'column', gap: 60, opacity: cardIn, transform: `translateY(${(1 - cardIn) * 120}px)` }}>
            <Card style={{ padding: 70 }}>
              <div style={{ fontSize: 58, fontWeight: 600, color: C.muted, marginBottom: 40 }}>Quick add</div>
              <div style={{ display: 'flex', gap: 34, alignItems: 'center' }}>
                <div
                  style={{
                    flex: 1,
                    height: 150,
                    borderRadius: 75,
                    background: '#151518',
                    border: `2px solid ${frame > 10 && frame < 76 ? 'rgba(61,134,255,0.6)' : C.line}`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 56px',
                    fontSize: 64,
                    color: C.ink,
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                  }}
                >
                  {phrase.slice(0, typed)}
                  <span style={{ width: 5, height: 74, background: C.blue, marginLeft: 6, opacity: caretOn ? 1 : 0 }} />
                </div>
                <div
                  style={{
                    height: 150,
                    padding: '0 56px',
                    borderRadius: 75,
                    background: frame >= 70 ? C.blue : '#2A2A30',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 22,
                    fontSize: 60,
                    fontWeight: 600,
                    color: C.ink,
                    transform: `scale(${press})`,
                  }}
                >
                  <Icon d={ICONS.sparkles} size={66} />
                  Parse
                </div>
              </div>
            </Card>
            <Card
              style={{
                padding: '60px 70px',
                display: 'flex',
                alignItems: 'center',
                gap: 50,
                opacity: result,
                transform: `translateY(${(1 - result) * -80}px) scale(${0.9 + result * 0.1})`,
              }}
            >
              <div
                style={{
                  width: 170,
                  height: 170,
                  borderRadius: '50%',
                  background: 'rgba(255,79,154,0.14)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Icon d={ICONS.basket} size={90} color={C.expense} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 76, fontWeight: 600, color: C.ink }}>Groceries</div>
                <div style={{ fontSize: 54, color: C.muted, marginTop: 10 }}>BigBasket · Food · Today</div>
              </div>
              <div style={{ fontSize: 96, fontWeight: 500, color: C.expense, letterSpacing: '-0.02em' }}>−{inr(450, 2)}</div>
            </Card>
          </div>
        }
      />
    </AbsoluteFill>
  );
};

/** 4 · Dashboard: the real home screen and the balance counting up. */
export const S4Dashboard: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const rise = usePop(0, 18);
  const tilt = interpolate(frame, [0, 135], [-14, -6], clamp);
  return (
    <AbsoluteFill>
      <GlowBg />
      <Split
        textWidth={1600}
        text={
          <>
            <Words text="Everything you own, in one place." size={portrait ? 190 : 180} />
            <div style={{ marginTop: 30 }}>
              <Sub size={portrait ? 64 : 60} delay={8}>
                Total balance
              </Sub>
              <Counter value={4436934} from={12} to={70} size={portrait ? 230 : 220} />
              <Sub size={portrait ? 64 : 60} delay={14}>
                Across 4 accounts, with net worth, cash flow and trends.
              </Sub>
            </div>
          </>
        }
        visual={
          <div style={{ perspective: 4000 }}>
            <Phone
              src="screens/dark/dashboard.png"
              height={portrait ? 2150 : 1760}
              style={{
                transform: `translateY(${(1 - rise) * 900}px) rotateY(${portrait ? 0 : tilt}deg) rotateX(${portrait ? 8 : 4}deg)`,
              }}
            />
          </div>
        }
      />
    </AbsoluteFill>
  );
};

const SOURCES = ['Zerodha', 'Groww', 'Upstox', 'CDSL', 'MFCentral CAS', 'HDFC Bank', 'ICICI Bank', 'SBI', 'Axis Bank', 'CSV'];

/** 5 · Import: broker and bank names fly into the phone. Names only, no logos. */
export const S5Import: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const rise = usePop(0, 18);
  const phoneH = portrait ? 2150 : 1700;
  return (
    <AbsoluteFill>
      <GlowBg />
      <Split
        textWidth={1450}
        text={
          <>
            <Words text="Bring your history." size={portrait ? 200 : 190} />
            <Sub size={portrait ? 80 : 74} delay={10}>
              Holdings from 18 brokers. Statements from your bank. Any CSV. Parsed on your device.
            </Sub>
          </>
        }
        visual={
          <div style={{ position: 'relative', width: portrait ? 1800 : phoneH * 1.15, height: phoneH * 1.1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Phone src="screens/dark/import.png" height={phoneH} style={{ transform: `translateY(${(1 - rise) * 700}px)` }} />
            {SOURCES.map((name, i) => {
              const start = 14 + i * 7;
              const t = interpolate(frame, [start, start + 34], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
              const angle = (i / SOURCES.length) * Math.PI * 2 + 0.3;
              const radius = phoneH * 0.72 * (1 - t);
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius * 0.85;
              // Gone before it reaches the phone, so no chip sits on the app's own text.
              const o = interpolate(t, [0, 0.12, 0.55, 0.8], [0, 1, 1, 0], clamp);
              return (
                <div
                  key={name}
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    transform: `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${1 - t * 0.5})`,
                    opacity: o,
                    padding: '30px 54px',
                    borderRadius: 999,
                    background: 'rgba(36,36,42,0.92)',
                    border: `2px solid rgba(61,134,255,0.45)`,
                    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                    fontFamily: FONT,
                    fontSize: 64,
                    fontWeight: 500,
                    color: C.ink,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {name}
                </div>
              );
            })}
          </div>
        }
      />
    </AbsoluteFill>
  );
};

/** 6 · Health score, then how long the emergency fund lasts. */
export const S6Score: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const ringIn = usePop(0, 18);
  const fund = usePop(60, 18);
  const bar = interpolate(frame, [66, 104], [0, 7.8 / 12], { ...clamp, easing: Easing.out(Easing.cubic) });
  const months = (7.8 * interpolate(frame, [66, 104], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) })).toFixed(1);
  return (
    <AbsoluteFill>
      <GlowBg />
      <Split
        textWidth={1450}
        text={
          <>
            <Words text="Know where you stand." size={portrait ? 200 : 190} />
            <Sub size={portrait ? 80 : 74} delay={10}>
              A health score out of 100, with the reasons behind it. And how long your savings would last.
            </Sub>
          </>
        }
        visual={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 70 }}>
            <Card style={{ padding: '60px 140px 40px', opacity: ringIn, transform: `scale(${0.85 + ringIn * 0.15})` }}>
              <ScoreRing value={76} from={6} to={56} size={portrait ? 1150 : 900} label="Strong" />
            </Card>
            <Card style={{ width: portrait ? 1500 : 1400, padding: '56px 70px', opacity: fund, transform: `translateY(${(1 - fund) * 100}px)` }}>
              <div style={{ fontSize: 56, color: C.muted }}>Emergency fund covers</div>
              <div style={{ fontSize: 130, fontWeight: 400, color: C.ink, marginTop: 6, fontVariantNumeric: 'tabular-nums' }}>
                {months} <span style={{ fontSize: 70, color: C.muted }}>months of expenses</span>
              </div>
              <div style={{ height: 34, borderRadius: 17, background: '#2A2A30', marginTop: 30, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${bar * 100}%`, borderRadius: 17, background: `linear-gradient(90deg, ${C.goldHi}, ${C.gold})` }} />
              </div>
            </Card>
          </div>
        }
      />
    </AbsoluteFill>
  );
};

const PILLARS = [
  { icon: ICONS.lock, title: 'No server', detail: 'No account. No tracking.' },
  { icon: ICONS.shield, title: 'AES-256', detail: 'Encrypted with a key only your PIN unlocks.' },
  { icon: ICONS.wifiOff, title: 'Works offline', detail: 'No internet required.' },
];

/** 7 · Trust: the three brand-sheet claims. */
export const S7Trust: React.FC = () => {
  const portrait = usePortrait();
  return (
    <AbsoluteFill>
      <GlowBg />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: portrait ? 120 : 150, padding: '0 180px' }}>
        <Words text="Private by design." size={portrait ? 210 : 220} align="center" />
        <div style={{ display: 'flex', flexDirection: portrait ? 'column' : 'row', gap: 70 }}>
          {PILLARS.map((p, i) => (
            <Pillar key={p.title} {...p} delay={10 + i * 8} width={portrait ? 1700 : 1000} row={portrait} />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const Pillar: React.FC<{ icon: string[]; title: string; detail: string; delay: number; width: number; row: boolean }> = ({ icon, title, detail, delay, width, row }) => {
  const p = usePop(delay, 16);
  return (
    <Card
      style={{
        width,
        padding: row ? '60px 70px' : '80px 70px',
        display: 'flex',
        flexDirection: row ? 'row' : 'column',
        alignItems: row ? 'center' : 'flex-start',
        gap: row ? 60 : 50,
        opacity: p,
        transform: `translateY(${(1 - p) * 120}px)`,
      }}
    >
      <div
        style={{
          width: 190,
          height: 190,
          borderRadius: 56,
          background: 'rgba(61,134,255,0.14)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <Icon d={icon} size={110} color={C.blue} />
      </div>
      <div>
        <div style={{ fontSize: 96, fontWeight: 600, color: C.ink, letterSpacing: '-0.02em' }}>{title}</div>
        <div style={{ fontSize: 58, color: C.muted, marginTop: 14, lineHeight: 1.3 }}>{detail}</div>
      </div>
    </Card>
  );
};

/** 8 · Call to action. */
export const S8Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const portrait = usePortrait();
  const mark = usePop(0, 14);
  const free = usePop(22, 12);
  const glow = 0.5 + Math.sin(frame / 10) * 0.15;
  return (
    <AbsoluteFill>
      <GlowBg hue="gold" />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', gap: portrait ? 90 : 70, padding: '0 160px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 60, opacity: mark, transform: `scale(${0.8 + mark * 0.2})` }}>
          <Mark size={portrait ? 300 : 280} />
          <div style={{ fontFamily: FONT, fontSize: portrait ? 230 : 220, fontWeight: 600, color: C.ink, letterSpacing: '-0.03em' }}>Khazana</div>
        </div>
        <Sub size={portrait ? 96 : 90} delay={8} align="center" color={C.ink}>
          Your wealth. Your vault.
        </Sub>
        <div
          style={{
            fontFamily: FONT,
            fontSize: portrait ? 190 : 200,
            fontWeight: 600,
            letterSpacing: '-0.03em',
            backgroundImage: `linear-gradient(100deg, ${C.goldHi}, ${C.gold})`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            opacity: free,
            transform: `scale(${0.7 + free * 0.3})`,
            filter: `drop-shadow(0 0 ${60 * glow}px rgba(213,169,78,${0.35 * free}))`,
            textAlign: 'center',
          }}
        >
          Free. Every feature.
        </div>
        <Sub size={portrait ? 80 : 76} delay={40} align="center">
          Try it now at <span style={{ color: C.ink, fontWeight: 500 }}>khazana-app.netlify.app</span>
        </Sub>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
