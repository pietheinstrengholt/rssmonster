import { describe, expect, it } from 'vitest';
import {
  extractClassCandidates,
  formatGuardReport,
  validateClassCandidates
} from '../scripts/check-bootstrap-classes.js';

// Validates an inline fixture through the same extraction and allowlist path as the command.
const validateSource = source => validateClassCandidates(
  source,
  extractClassCandidates(source),
  { filePath: 'fixture.vue' }
);

// Exercises accepted source forms, disabled families, and the explicit runtime escape hatch.
describe('Bootstrap class guard', () => {
  // This test covers every supported extraction form and current dynamic badge outcomes.
  it('accepts current static, bound, returned, and escaped dynamic classes', () => {
    const source = `
      <div class="row col-md-9 alert badge text-bg-primary d-flex mt-2"></div>
      <span :class="condition ? 'text-bg-secondary' : 'text-bg-success'"></span>
      <span :class="\`alert-\${setupMessageType}\`"></span>
      <script>
      function evidenceClass(type) {
        if (type === 'info') return 'text-bg-info';
        return 'text-bg-dark';
      }
      </script>
    `;

    expect(validateSource(source)).toEqual([]);
  });

  // This test proves disabled component families produce actionable failures.
  it('rejects a Bootstrap component family that is not imported', () => {
    const source = '<div class="accordion accordion-item"></div>';
    const failures = validateSource(source);
    const report = formatGuardReport({
      candidateCount: 2,
      failures,
      fileCount: 1
    });

    expect(failures).toHaveLength(2);
    expect(report).toContain('fixture.vue:1');
    expect(report).toContain('component family "accordion", which is not enabled');
    expect(report).toContain('Enable the required SCSS module or utility-map family first');
  });

  // This test proves pruned generated utility families cannot re-enter source unnoticed.
  it('rejects a generated utility family that is not enabled', () => {
    const source = '<div class="p-3"></div>';
    const failures = validateSource(source);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('utility family "padding", which is not enabled');
  });

  // This test keeps responsive utility generation aligned with responsive source usage.
  it('rejects a responsive variant when its utility family only emits base classes', () => {
    const source = '<div class="d-md-flex"></div>';
    const failures = validateSource(source);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain(
      'responsive generation for Bootstrap utility family "display", which is not enabled'
    );
  });

  // This test prevents unresolved Bootstrap runtime templates from bypassing the boundary.
  it('requires explicit outcomes for Bootstrap runtime templates', () => {
    const source = '<div :class="`alert-${runtimeValue}`"></div>';
    const failures = validateSource(source);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('enumerate its finite outcomes in DYNAMIC_CLASS_ESCAPES');
  });
});
