// The shared Zentra components (packages/ui-ts) build and render in this app,
// with this app's single copy of React.
import { expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { GlassCard, Chip } from '@khazana/ui/ui';
import { AreaChart } from '@khazana/ui/charts/AreaChart';

test('a card, a chip and a chart from @khazana/ui render here', () => {
  const html = renderToStaticMarkup(
    <GlassCard>
      <Chip>Sandbox</Chip>
      <AreaChart values={[120, 180, 150, 210]} labels={['Jul', 'Aug', 'Sep', 'Oct']} />
    </GlassCard>,
  );
  expect(html).toContain('card');
  expect(html).toContain('Sandbox');
  expect(html).toContain('<svg');
});
