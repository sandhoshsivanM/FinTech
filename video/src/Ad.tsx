import React from 'react';
import { AbsoluteFill, Audio, getStaticFiles, interpolate, staticFile } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import './fonts';
import { C } from './theme';
import { S1Hook, S2Turn, S3QuickAdd, S4Dashboard, S5Import, S6Score, S7Trust, S8Cta } from './scenes';

export const FPS = 30;
const T = 15; // transition length; neighbouring scenes overlap by this much

// Scene lengths sum to 1005 frames; the seven 15-frame overlaps bring the ad to 900 (30s).
const SCENES: { C: React.FC; frames: number }[] = [
  { C: S1Hook, frames: 105 },
  { C: S2Turn, frames: 120 },
  { C: S3QuickAdd, frames: 135 },
  { C: S4Dashboard, frames: 135 },
  { C: S5Import, frames: 135 },
  { C: S6Score, frames: 135 },
  { C: S7Trust, frames: 120 },
  { C: S8Cta, frames: 120 },
];
export const AD_FRAMES = SCENES.reduce((n, s) => n + s.frames, 0) - (SCENES.length - 1) * T;

const TRANSITIONS = [fade(), fade(), slide({ direction: 'from-right' }), slide({ direction: 'from-bottom' }), slide({ direction: 'from-right' }), fade(), fade()];

// Drop a licensed track at public/music.mp3 and it is mixed in with a fade in
// and out; without one the ad renders silent.
const MUSIC = 'music.mp3';
const hasMusic = () => getStaticFiles().some((f) => f.name === MUSIC);

export const Ad: React.FC = () => (
  <AbsoluteFill style={{ background: C.canvas }}>
    <TransitionSeries>
      {SCENES.flatMap((s, i) => {
        const seq = (
          <TransitionSeries.Sequence key={`s${i}`} durationInFrames={s.frames}>
            <s.C />
          </TransitionSeries.Sequence>
        );
        return i === 0
          ? [seq]
          : [<TransitionSeries.Transition key={`t${i}`} presentation={TRANSITIONS[i - 1]} timing={linearTiming({ durationInFrames: T })} />, seq];
      })}
    </TransitionSeries>
    {hasMusic() && (
      <Audio
        src={staticFile(MUSIC)}
        volume={(f) => interpolate(f, [0, 20, AD_FRAMES - 45, AD_FRAMES], [0, 0.9, 0.9, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' })}
      />
    )}
  </AbsoluteFill>
);
