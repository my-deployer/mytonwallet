import type { LovelyChartInstance } from 'lovely-chart';

import { destroyLovelyChartInstances } from './useLovelyChart';

describe('LovelyChart lifecycle', () => {
  it('destroys active and outgoing instances exactly once', () => {
    const outgoing = instance();
    const active = instance();

    destroyLovelyChartInstances(outgoing, active, outgoing, undefined);

    expect(outgoing.destroy).toHaveBeenCalledTimes(1);
    expect(active.destroy).toHaveBeenCalledTimes(1);
  });
});

function instance(): LovelyChartInstance {
  return { destroy: jest.fn() } as unknown as LovelyChartInstance;
}
