import { describe, expect, it } from 'vitest';

import managerSource from '../src/api/manager.js?raw';

const apiModules = import.meta.glob('../src/api/*.js');

describe('manager overview API contract', () => {
  // This assertion keeps overview requests on the server's POST contract.
  it('uses POST for the active overview endpoint', () => {
    expect(managerSource).toMatch(
      /api\.post\(['"]\/manager\/overview['"]/
    );
    expect(managerSource).not.toMatch(
      /api\.get\(['"]\/manager\/overview['"]/
    );
  });

  // This assertion prevents the obsolete GET overview client from returning.
  it('does not include the legacy overview API module', () => {
    expect(apiModules).not.toHaveProperty('../src/api/overview.js');
  });
});
