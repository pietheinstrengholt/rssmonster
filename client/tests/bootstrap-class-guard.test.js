import { describe, expect, it } from 'vitest';
import {
  extractBootstrapCssVariables,
  extractClassCandidates,
  extractDataBsAttributes,
  extractForbiddenFrameworkImports,
  extractStyleClassCandidates,
  formatGuardReport,
  validateClassCandidates,
  validateForbiddenFrameworkUsage
} from '../scripts/check-bootstrap-classes.js';

// Validates an inline fixture through the same extraction and allowlist path as the command.
const validateSource = source => validateClassCandidates(
  source,
  extractClassCandidates(source),
  { filePath: 'fixture.vue' }
);

// Exercises accepted source forms and disabled Bootstrap families.
describe('Bootstrap class guard', () => {
  // This test covers every supported extraction form with native application classes.
  it('accepts current native static, bound, and returned classes', () => {
    const source = `
      <div class="app-form-control"></div>
      <span :class="condition ? 'app-form-select' : 'app-form-label'"></span>
      <script>
      function controlClass(type) {
        if (type === 'select') return 'app-form-select';
        return 'app-form-label';
      }
      </script>
    `;

    expect(validateSource(source)).toEqual([]);
  });

  // This test prevents Bootstrap form presentation classes from returning.
  it('rejects migrated Bootstrap form classes', () => {
    const failures = validateSource(`
      <label class="form-label"><input class="form-control is-invalid"><select class="form-select"></select></label>
    `);

    expect(failures).toHaveLength(4);
    expect(failures.every(failure => failure.reason.includes(
      'retired Bootstrap component family "forms"'
    ))).toBe(true);
  });

  // This test prevents Bootstrap button presentation classes from returning.
  it('rejects migrated Bootstrap button classes', () => {
    const failures = validateSource(`
      <button class="btn btn-primary btn-outline-secondary btn-sm">Save</button>
    `);

    expect(failures).toHaveLength(4);
    expect(failures.every(failure => failure.reason.includes(
      'retired Bootstrap component family "buttons"'
    ))).toBe(true);
  });

  // This test prevents retired selectors from surviving only as compatibility CSS.
  it('rejects Bootstrap class selectors in component styles', () => {
    const source = '<style>.modal-body, .dropdown-menu { padding: 0; }</style>';
    const failures = validateClassCandidates(
      source,
      extractStyleClassCandidates(source, '.vue'),
      { filePath: 'fixture.vue' }
    );

    expect(failures).toHaveLength(2);
    expect(failures.every(failure => failure.origin === 'style class selector')).toBe(true);
  });

  // This test prevents Bootstrap grid and generated utility classes from returning.
  it('rejects migrated grid, layout, spacing, alignment, and color utilities', () => {
    const failures = validateSource(`
      <div class="row col-md-9 d-flex mt-2 gap-2 align-items-center text-danger"></div>
    `);

    expect(failures).toHaveLength(7);
    expect(failures.every(failure => failure.reason.includes('retired Bootstrap'))).toBe(true);
  });

  // This test prevents the migrated small-presentation Bootstrap families from returning.
  it('rejects migrated notices, badges, spinners, helpers, and font-weight utilities', () => {
    const failures = validateSource(`
      <div class="alert alert-danger badge text-bg-primary spinner-border visually-hidden small fw-semibold"></div>
    `);

    expect(failures).toHaveLength(8);
    expect(failures.every(failure => failure.reason.includes('retired Bootstrap'))).toBe(true);
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
    expect(report).toContain('retired Bootstrap component family "accordion"');
    expect(report).toContain('Use an RSSMonster-owned primitive or selector');
  });

  // This test prevents Bootstrap dropdown presentation classes from returning after native migration.
  it('rejects Bootstrap dropdown classes', () => {
    const failures = validateSource(
      '<div class="dropdown"><button class="dropdown-toggle"></button><div class="dropdown-menu"></div></div>'
    );

    expect(failures).toHaveLength(3);
    expect(failures.every(failure => failure.reason.includes(
      'retired Bootstrap component family "dropdown"'
    ))).toBe(true);
  });

  // This test proves pruned generated utility families cannot re-enter source unnoticed.
  it('rejects a generated utility family that is not enabled', () => {
    const source = '<div class="p-3"></div>';
    const failures = validateSource(source);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('retired Bootstrap utility family "spacing"');
  });

  // This test keeps removed responsive utility variants from returning.
  it('rejects a responsive variant when its utility family is disabled', () => {
    const source = '<div class="d-md-flex"></div>';
    const failures = validateSource(source);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('retired Bootstrap utility family "display"');
  });

  // This test prevents unresolved Bootstrap runtime templates from bypassing the boundary.
  it('requires explicit outcomes for Bootstrap runtime templates', () => {
    const source = '<div :class="`alert-${runtimeValue}`"></div>';
    const failures = validateSource(source);

    expect(failures).toHaveLength(1);
    expect(failures[0].reason).toContain('retired Bootstrap component family "alert"');
  });

  // This test preserves the independent Bootstrap Icons build-time package.
  it('allows bootstrap-icons imports while rejecting framework packages', () => {
    const iconsSource = "import icons from 'bootstrap-icons/icons/rss.svg';";
    expect(extractForbiddenFrameworkImports(iconsSource)).toEqual([]);

    const frameworkSource = `
      import Modal from 'bootstrap/js/dist/modal.js';
      import theme from 'bootswatch/dist/flatly/variables';
      const popper = import('@popperjs/core');
      @use "bootstrap/scss/reboot";
    `;

    expect(extractForbiddenFrameworkImports(frameworkSource).map(candidate => candidate.value))
      .toEqual([
        'bootstrap/js/dist/modal.js',
        'bootswatch/dist/flatly/variables',
        '@popperjs/core',
        'bootstrap/scss/reboot'
      ]);
  });

  // This test covers declarative behavior, imports, CSS variables, and the global JavaScript API.
  it('rejects retired Bootstrap runtime and styling entry points', () => {
    const source = `
      import Dropdown from 'bootstrap/js/dist/dropdown.js';
      const modulePromise = import('bootstrap/js/dist/modal.js');
      <button data-bs-toggle="dropdown" style="color: var(--bs-primary)">Open</button>
      bootstrap.Dropdown.getOrCreateInstance(button);
    `;

    expect(extractDataBsAttributes(source).map(candidate => candidate.value))
      .toEqual(['data-bs-toggle']);
    expect(extractForbiddenFrameworkImports(source).map(candidate => candidate.value))
      .toEqual(['bootstrap/js/dist/dropdown.js', 'bootstrap/js/dist/modal.js']);
    expect(extractBootstrapCssVariables(source).map(candidate => candidate.value))
      .toEqual(['--bs-primary']);

    const failures = validateForbiddenFrameworkUsage(source, {
      filePath: 'fixture.vue'
    });

    expect(failures).toHaveLength(5);
    expect(failures.map(failure => failure.reason).join('\n')).toContain('Bootstrap data attribute');
    expect(failures.map(failure => failure.reason).join('\n')).toContain('retired framework import');
    expect(failures.map(failure => failure.reason).join('\n')).toContain('Bootstrap CSS variable');
    expect(failures.map(failure => failure.reason).join('\n')).toContain('Bootstrap JavaScript API');
  });
});
