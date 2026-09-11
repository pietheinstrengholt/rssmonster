import { describe, expect, it } from 'vitest';
import {
  extractOccurrenceFeatures as extract,
  aggregateOccurrenceFeatures as aggregate,
  compareOccurrenceFeatures as compare
} from '../../services/events/occurrenceFeatures.js';

const features = title => extract({ title });
const comparison = (left, right) => compare(features(left), features(right));

describe('deterministic occurrence features', () => {
  it.each([
    ['Acme releases Orion OS 4.2', 'orion os', '4.2'],
    ['iOS 26.6 released', 'ios', '26.6'],
    ['Windows 11 25H2 released', 'windows', '11 25h2'],
    ['GPT-6 announced', 'gpt', '6'],
    ['RTX 5090 released', 'rtx', '5090'],
    ['CVE-2026-1234 disclosed', 'cve', '2026-1234'],
    ['Orion OS v4.2.1-beta2 released', 'orion os', '4.2.1-beta2'],
    ['iOS 26.6 beta 1 released', 'ios:beta', 'beta 1']
  ])('preserves scoped identifiers: %s', (title, product, value) => {
    expect(features(title).versions).toContainEqual({ product, value });
  });

  it('extracts unscoped beta identifiers without treating them as conflicting products', () => {
    expect(features('Developer beta 1 available').versions).toContainEqual({ product: null, value: 'beta 1' });
    expect(comparison('Developer beta 1 available', 'Developer beta 2 available').versionConflict).toBe(false);
  });

  it('compares versions only within the same explicitly identified product', () => {
    expect(comparison('Orion OS 4.2 released', 'Orion OS 4.3 released')).toMatchObject({ versionConflict: true, versionAgreement: false });
    expect(comparison('Orion OS 4.2 released', 'Orion OS 4.2 arrives')).toMatchObject({ versionConflict: false, versionAgreement: true });
    expect(comparison('Orion OS 4.2 released', 'iOS 26.6 arrives').versionConflict).toBe(false);
  });

  it('prefers the title occurrence over historical versions mentioned in the description', () => {
    const article = extract({ title: 'Orion OS 4.3 released', description: 'This replaces Orion OS 4.2.' });
    expect(article.versions).toEqual([{ product: 'orion os', value: '4.3' }]);
    expect(compare(article, features('Orion OS 4.2 released')).versionConflict).toBe(true);
  });

  it('does not assign versions to injury counts, dates, or prices', () => {
    expect(features('Train collision injures 12 on September 16, 2026; tickets cost 9.50 euros').versions).toEqual([]);
    expect(features('Costs 9.50 euros; USD 12.50 per passenger').versions).toEqual([]);
  });

  it('does not force multi-version comparison coverage into one version identity', () => {
    const overview = features('Orion OS 4.2 versus 4.3');
    expect(overview.versions).toHaveLength(2);
    expect(compare(overview, features('Orion OS 4.3 released')).versionConflict).toBe(false);
  });

  it('extracts occurrence places across wording and ignores missing or multiple places', () => {
    expect(comparison('Train collision in Rotterdam injures 12', 'Rotterdam rail crash leaves 12 injured')).toMatchObject({ locationAgreement: true, locationConflict: false });
    expect(comparison('Train collision in Rotterdam injures 12', 'Antwerp rail crash leaves 9 injured').locationConflict).toBe(true);
    expect(comparison('Train collision injures 12', 'Train collision in Antwerp injures 9').locationConflict).toBe(false);
    const multiple = extract({ title: 'Rail disruption', description: 'Trains collided outside Rotterdam. Another collision in Antwerp halted traffic.' });
    expect(compare(multiple, features('Train collision in Rotterdam')).locationConflict).toBe(false);
  });

  it.each([
    ['launches', 'launch'], ['launched', 'launch'], ['launching', 'launch'],
    ['cancelled', 'cancel'], ['cancels', 'cancel'], ['discontinued', 'discontinue'],
    ['announces', 'announce'], ['released', 'release'], ['opened', 'open'],
    ['closed', 'close'], ['delayed', 'delay'], ['recalled', 'recall'],
    ['acquired', 'acquire'], ['sold', 'sell'], ['updated', 'update']
  ])('normalizes %s', (verb, action) => {
    expect(features(`Acme ${verb} Project Nova`).actions).toContain(action);
  });

  it('keeps a city and a venue in that city compatible across languages', () => {
    const english = extract({ title: 'Acme opens a research center', description: 'Acme opened its new center at Amsterdam Science Park.' });
    const dutch = features('Acme opent nieuw onderzoekscentrum in Amsterdam');
    expect(compare(english, dutch)).toMatchObject({ locationAgreement: true, locationConflict: false });
  });

  it('marks opposing actions but does not equate all differing verbs with conflict', () => {
    expect(comparison('Contoso launches Nova', 'Contoso cancels Nova')).toMatchObject({ actionConflict: true, strongActionConflict: false });
    expect(comparison('Acme announces Orion X1', 'Acme releases Orion X1 pricing').actionConflict).toBe(false);
  });

  it('combines a price cut and existing-product state against a new-generation launch', () => {
    const left = extract({ title: 'Fabrikam cuts the price of its existing Lyra Air notebook' });
    const right = extract({ title: 'New Lyra Air notebook unveiled', description: 'The new generation has a faster processor.' });
    expect(left.objectTerms).toEqual(['existing_product']);
    expect(right.objectTerms).toEqual(['new_generation']);
    expect(compare(left, right)).toMatchObject({ actionConflict: true, objectConflict: true, strongActionConflict: true });
    expect(compare(right, left).strongActionConflict).toBe(true);
  });

  it('does not split launch pricing or pre-orders from their announcement', () => {
    const launch = features('Acme launches new generation Orion X1 notebook');
    for (const title of ['Acme reveals Orion X1 pricing after launch', 'Orion X1 pre-orders open following yesterday’s announcement']) {
      expect(compare(features(title), launch)).toMatchObject({ strongActionConflict: false, objectConflict: false, actionConflict: false });
    }
  });

  it('leaves missing evidence neutral', () => {
    expect(compare(features('Local news'), features('Orion OS 4.3 launch in Rotterdam'))).toEqual({
      versionAgreement: false, versionConflict: false, locationAgreement: false, locationConflict: false,
      actionAgreement: false, actionConflict: false, objectAgreement: false, objectConflict: false, strongActionConflict: false
    });
  });

  it('requires corroboration and discounts one noisy member', () => {
    const good = features('Orion OS 4.2 released');
    const noise = features('Orion OS 4.3 released');
    expect(aggregate([good, good, noise]).versions).toEqual(good.versions);
    expect(aggregate([good, noise]).versions).toEqual([]);
    expect(aggregate([good, features('Local news'), features('More news')]).versions).toEqual([]);
    expect(aggregate([good]).versions).toEqual(good.versions);
  });

  it('reuses extracted features and invalidates them when input text changes', () => {
    const article = { title: 'Orion OS 4.2 released' };
    const initial = extract(article);
    expect(extract(article)).toBe(initial);
    article.title = 'Orion OS 4.3 released';
    expect(extract(article)).not.toBe(initial);
  });
});
