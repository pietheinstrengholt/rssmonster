import { sortIslandsByWeight } from '../../services/islands/islandVectorUtils.js';

describe('island vector utilities', () => {
  it('sorts islands by descending weight and ascending id', () => {
    const islands = [
      { id: 3, weight: 0.2 },
      { id: 2, weight: 0.8 },
      { id: 1, weight: 0.8 }
    ];

    expect(sortIslandsByWeight(islands).map(island => island.id)).toEqual([1, 2, 3]);
  });
});
