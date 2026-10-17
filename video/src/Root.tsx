import { Composition } from 'remotion';
import { Ad, AD_FRAMES, FPS } from './Ad';

export const Root: React.FC = () => (
  <>
    <Composition id="Ad16x9" component={Ad} durationInFrames={AD_FRAMES} fps={FPS} width={3840} height={2160} />
    <Composition id="Ad9x16" component={Ad} durationInFrames={AD_FRAMES} fps={FPS} width={2160} height={3840} />
  </>
);
