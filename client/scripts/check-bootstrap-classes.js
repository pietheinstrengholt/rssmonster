import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const clientRoot = resolve(dirname(scriptPath), '..');
const defaultSourceDirectory = resolve(clientRoot, 'src');

export const ENABLED_COMPONENT_FAMILIES = new Set([
  'alert',
  'badge',
  'buttons',
  'close',
  'dropdown',
  'forms',
  'grid',
  'helpers',
  'list-group',
  'modal',
  'spinners',
  'transitions',
  'type'
]);

export const ENABLED_UTILITY_FAMILIES = new Set([
  'align-items',
  'align-self',
  'color',
  'display',
  'flex-grow',
  'font-weight',
  'gap',
  'justify-content',
  'margin-bottom',
  'margin-end',
  'margin-start',
  'margin-top',
  'text-transform'
]);

export const ENABLED_RESPONSIVE_UTILITY_FAMILIES = new Set();

// Enumerates finite outcomes for Bootstrap-looking runtime templates that static analysis cannot resolve.
export const DYNAMIC_CLASS_ESCAPES = new Map([
  ['alert-${setupMessageType}', ['alert-danger', 'alert-warning']]
]);

const COMPONENT_CLASSIFIERS = [
  { family: 'accordion', pattern: /^accordion(?:-|$)/ },
  { family: 'breadcrumb', pattern: /^breadcrumb(?:-|$)/ },
  { family: 'button-group', pattern: /^btn-(?:group|toolbar)(?:-|$)/ },
  { family: 'card', pattern: /^card(?:-|$)/ },
  { family: 'carousel', pattern: /^carousel(?:-|$)/ },
  { family: 'collapse', pattern: /^(?:collapse|collapsing)(?:-|$)/ },
  { family: 'nav', pattern: /^nav(?:-|$)/ },
  { family: 'navbar', pattern: /^navbar(?:-|$)/ },
  { family: 'offcanvas', pattern: /^offcanvas(?:-|$)/ },
  { family: 'pagination', pattern: /^(?:pagination|page-(?:item|link))(?:-|$)/ },
  { family: 'placeholder', pattern: /^placeholder(?:-|$)/ },
  { family: 'popover', pattern: /^popover(?:-|$)/ },
  { family: 'progress', pattern: /^progress(?:-|$)/ },
  { family: 'tables', pattern: /^table(?:-|$)/ },
  { family: 'toast', pattern: /^toast(?:-|$)/ },
  { family: 'tooltip', pattern: /^tooltip(?:-|$)/ },
  { family: 'close', pattern: /^btn-close(?:-|$)/ },
  { family: 'forms', pattern: /^(?:form|input-group|valid|invalid|was-validated)(?:-|$)/ },
  { family: 'buttons', pattern: /^btn(?:-|$)/ },
  { family: 'dropdown', pattern: /^(?:dropdown|dropup|dropend|dropstart)(?:-|$)/ },
  { family: 'badge', pattern: /^badge$/ },
  { family: 'alert', pattern: /^alert(?:-|$)/ },
  { family: 'list-group', pattern: /^list-group(?:-|$)/ },
  { family: 'modal', pattern: /^modal(?:-|$)/ },
  { family: 'spinners', pattern: /^spinner-(?:border|grow)(?:-|$)/ },
  { family: 'transitions', pattern: /^(?:fade|show)$/ },
  {
    family: 'helpers',
    pattern: /^(?:clearfix|fixed-top|ratio|sticky-top|stretched-link|text-truncate|vstack|hstack|visually-hidden|vr)(?:-|$)/
  },
  { family: 'type', pattern: /^(?:blockquote|display-[1-6]|initialism|lead|list-inline|mark|small)(?:-|$)/ },
  {
    family: 'grid',
    pattern: /^(?:container(?:-fluid|-sm|-md|-lg|-xl|-xxl)?|row|col(?:-(?:sm|md|lg|xl|xxl))?(?:-(?:auto|\d+))?|offset(?:-(?:sm|md|lg|xl|xxl))?-\d+|g[xy]?(?:-(?:sm|md|lg|xl|xxl))?-\d+)$/
  },
  { family: 'helpers', pattern: /^text-bg-(?:primary|secondary|success|info|warning|danger|light|dark)$/ }
];

const UTILITY_CLASSIFIERS = [
  { family: 'alignment', pattern: /^align-(?:baseline|top|middle|bottom|text-bottom|text-top)$/ },
  { family: 'float', pattern: /^float(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|none)$/ },
  { family: 'object-fit', pattern: /^object-fit(?:-(?:sm|md|lg|xl|xxl))?-(?:contain|cover|fill|scale|none)$/ },
  { family: 'opacity', pattern: /^opacity-(?:0|25|50|75|100)$/ },
  { family: 'overflow', pattern: /^overflow(?:-[xy])?-(?:auto|hidden|visible|scroll)$/ },
  {
    family: 'display',
    pattern: /^d(?:-(?:sm|md|lg|xl|xxl))?-(?:none|inline|inline-block|block|grid|inline-grid|table|table-row|table-cell|flex|inline-flex)$/
  },
  { family: 'shadow', pattern: /^shadow(?:-sm|-lg|-none)?$/ },
  { family: 'focus-ring', pattern: /^focus-ring(?:-|$)/ },
  { family: 'position', pattern: /^(?:position-(?:static|relative|absolute|fixed|sticky)|(?:top|bottom|start|end)-(?:0|50|100)|translate-middle(?:-[xy])?)$/ },
  { family: 'border', pattern: /^border(?:-(?:top|end|bottom|start))?(?:-(?:0|1|2|3|4|5|primary|secondary|success|info|warning|danger|light|dark|black|white))?$/ },
  { family: 'border', pattern: /^rounded(?:-(?:top|end|bottom|start|circle|pill|0|1|2|3|4|5))?$/ },
  { family: 'sizing', pattern: /^(?:w|h)-(?:25|50|75|100|auto)$/ },
  { family: 'sizing', pattern: /^(?:mw|mh)-100$|^(?:vw|vh)-100$|^min-v[wh]-100$/ },
  { family: 'flex-grow', pattern: /^flex(?:-(?:sm|md|lg|xl|xxl))?-grow-[01]$/ },
  { family: 'justify-content', pattern: /^justify-content(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|between|around|evenly)$/ },
  { family: 'align-items', pattern: /^align-items(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|baseline|stretch)$/ },
  { family: 'align-self', pattern: /^align-self(?:-(?:sm|md|lg|xl|xxl))?-(?:auto|start|end|center|baseline|stretch)$/ },
  {
    family: 'flex',
    pattern: /^(?:flex(?:-(?:sm|md|lg|xl|xxl))?-(?:row|row-reverse|column|column-reverse|grow-0|grow-1|shrink-0|shrink-1|wrap|nowrap|wrap-reverse|fill)|justify-content(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|between|around|evenly)|align-(?:items|content|self)(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|baseline|stretch)|order(?:-(?:sm|md|lg|xl|xxl))?-(?:first|last|0|1|2|3|4|5))$/
  },
  { family: 'margin', pattern: /^m(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'margin-x', pattern: /^mx(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'margin-y', pattern: /^my(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'margin-top', pattern: /^mt(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'margin-end', pattern: /^me(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'margin-bottom', pattern: /^mb(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'margin-start', pattern: /^ms(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'padding', pattern: /^p(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'padding-x', pattern: /^px(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'padding-y', pattern: /^py(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'padding-top', pattern: /^pt(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'padding-end', pattern: /^pe(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'padding-bottom', pattern: /^pb(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'padding-start', pattern: /^ps(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'gap', pattern: /^(?:gap|row-gap|column-gap)(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'text', pattern: /^font-(?:monospace|sans-serif|serif)$/ },
  { family: 'font-weight', pattern: /^fw-(?:lighter|light|normal|medium|semibold|bold|bolder)$/ },
  { family: 'text', pattern: /^fs-[1-6]$|^fst-(?:italic|normal)$/ },
  { family: 'text', pattern: /^lh-(?:1|sm|base|lg)$/ },
  { family: 'text', pattern: /^text(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center)$/ },
  { family: 'text-transform', pattern: /^text-(?:lowercase|uppercase|capitalize)$/ },
  { family: 'text', pattern: /^text-(?:wrap|nowrap|break|decoration-none|decoration-underline|decoration-line-through)$/ },
  {
    family: 'color',
    pattern: /^text-(?:primary|secondary|success|info|warning|danger|light|dark|black|white|body|muted|black-50|white-50|body-secondary|body-tertiary|body-emphasis|reset)(?:-emphasis)?$/
  },
  { family: 'text', pattern: /^text-opacity-(?:25|50|75|100)$/ },
  { family: 'text', pattern: /^link-(?:opacity|offset|underline|underline-opacity)(?:-|$)/ },
  {
    family: 'background',
    pattern: /^bg-(?:primary|secondary|success|info|warning|danger|light|dark|black|white|body|transparent|body-secondary|body-tertiary)(?:-subtle)?$/
  },
  { family: 'background', pattern: /^bg-opacity-(?:10|25|50|75|100)$|^bg-gradient$/ },
  { family: 'user-select', pattern: /^user-select-(?:all|auto|none)$/ },
  { family: 'pointer-events', pattern: /^pe-(?:auto|none)$/ },
  { family: 'visibility', pattern: /^(?:visible|invisible)$/ },
  { family: 'z-index', pattern: /^z-(?:n1|0|1|2|3)$/ }
];

const STATIC_CLASS_ATTRIBUTE_PATTERN = /(?<![:\w-])class\s*=\s*(["'])([\s\S]*?)\1/g;
const BOUND_CLASS_ATTRIBUTE_PATTERN = /(?:^|\s)(?::class|v-bind:class)\s*=\s*(["'])([\s\S]*?)\1/g;
const STRING_LITERAL_PATTERN = /(["'`])([^"'`]*?)\1/g;
const RETURNED_STRING_PATTERN = /\breturn\s+(["'`])([^"'`]*?)\1/g;
const ARROW_STRING_PATTERN = /=>\s*(["'`])([^"'`]*?)\1/g;
const DYNAMIC_SEGMENT_PATTERN = /\$\{[^}]+\}/g;
const RESPONSIVE_UTILITY_PATTERN = /-(?:sm|md|lg|xl|xxl)-/;

// Converts a whitespace-delimited class string into source-located candidates.
const addClassTokens = (candidates, value, index, origin) => {
  value.split(/\s+/).filter(Boolean).forEach(className => {
    candidates.push({ className, index, origin });
  });
};

// Extracts simple string literals from a Vue class binding expression.
const extractBoundClassStrings = expression => {
  const values = [];
  let match;

  STRING_LITERAL_PATTERN.lastIndex = 0;
  while ((match = STRING_LITERAL_PATTERN.exec(expression)) !== null) {
    values.push(match[2]);
  }

  return values;
};

// Extracts analyzable static, bound, and directly returned class strings from one source file.
export const extractClassCandidates = source => {
  const candidates = [];
  let match;

  STATIC_CLASS_ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = STATIC_CLASS_ATTRIBUTE_PATTERN.exec(source)) !== null) {
    addClassTokens(candidates, match[2], match.index, 'static class attribute');
  }

  BOUND_CLASS_ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = BOUND_CLASS_ATTRIBUTE_PATTERN.exec(source)) !== null) {
    extractBoundClassStrings(match[2]).forEach(value => {
      addClassTokens(candidates, value, match.index, 'bound class string');
    });
  }

  for (const pattern of [RETURNED_STRING_PATTERN, ARROW_STRING_PATTERN]) {
    pattern.lastIndex = 0;
    while ((match = pattern.exec(source)) !== null) {
      addClassTokens(candidates, match[2], match.index, 'returned class string');
    }
  }

  return candidates;
};

// Resolves a recognized Bootstrap class to its component or generated utility family.
export const classifyBootstrapClass = className => {
  const component = COMPONENT_CLASSIFIERS.find(classifier => classifier.pattern.test(className));
  if (component) {
    return { family: component.family, kind: 'component' };
  }

  const utility = UTILITY_CLASSIFIERS.find(classifier => classifier.pattern.test(className));
  if (utility) {
    return {
      family: utility.family,
      kind: 'utility',
      responsive: RESPONSIVE_UTILITY_PATTERN.test(className)
    };
  }

  return null;
};

// Calculates a one-based line number for an extracted class candidate.
const lineNumberAt = (source, index) => source.slice(0, index).split('\n').length;

// Validates extracted classes against enabled families and explicit runtime-template outcomes.
export const validateClassCandidates = (
  source,
  candidates,
  {
    dynamicClassEscapes = DYNAMIC_CLASS_ESCAPES,
    enabledComponentFamilies = ENABLED_COMPONENT_FAMILIES,
    enabledResponsiveUtilityFamilies = ENABLED_RESPONSIVE_UTILITY_FAMILIES,
    enabledUtilityFamilies = ENABLED_UTILITY_FAMILIES,
    filePath = '<source>'
  } = {}
) => {
  const failures = [];

  candidates.forEach(candidate => {
    if (candidate.className.includes('${')) {
      const templateClassification = classifyBootstrapClass(
        candidate.className.replace(DYNAMIC_SEGMENT_PATTERN, 'dynamic')
      );
      if (!templateClassification) {
        return;
      }

      const outcomes = dynamicClassEscapes.get(candidate.className);
      if (!outcomes) {
        failures.push({
          ...candidate,
          filePath,
          line: lineNumberAt(source, candidate.index),
          reason: `Bootstrap-looking runtime template "${candidate.className}" cannot be resolved; `
            + 'enumerate its finite outcomes in DYNAMIC_CLASS_ESCAPES.'
        });
        return;
      }

      outcomes.forEach(className => {
        const classification = classifyBootstrapClass(className);
        const enabledFamilies = classification?.kind === 'component'
          ? enabledComponentFamilies
          : enabledUtilityFamilies;
        if (!classification || !enabledFamilies.has(classification.family)) {
          failures.push({
            ...candidate,
            className,
            filePath,
            line: lineNumberAt(source, candidate.index),
            reason: `Dynamic outcome "${className}" is not covered by an enabled Bootstrap family.`
          });
        }
      });
      return;
    }

    const classification = classifyBootstrapClass(candidate.className);
    if (!classification) {
      return;
    }

    const enabledFamilies = classification.kind === 'component'
      ? enabledComponentFamilies
      : enabledUtilityFamilies;
    if (!enabledFamilies.has(classification.family)) {
      failures.push({
        ...candidate,
        classification,
        filePath,
        line: lineNumberAt(source, candidate.index),
        reason: `"${candidate.className}" requires Bootstrap ${classification.kind} family `
          + `"${classification.family}", which is not enabled.`
      });
      return;
    }

    if (
      classification.kind === 'utility'
      && classification.responsive
      && !enabledResponsiveUtilityFamilies.has(classification.family)
    ) {
      failures.push({
        ...candidate,
        classification,
        filePath,
        line: lineNumberAt(source, candidate.index),
        reason: `"${candidate.className}" requires responsive generation for Bootstrap utility family `
          + `"${classification.family}", which is not enabled.`
      });
    }
  });

  return failures;
};

// Finds Vue and JavaScript source files without traversing dependencies or generated output.
const listSourceFiles = directory => {
  const files = [];

  readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFiles(entryPath));
      return;
    }

    if (entry.isFile() && ['.js', '.vue'].includes(extname(entry.name))) {
      files.push(entryPath);
    }
  });

  return files;
};

// Scans the client source tree and returns actionable Bootstrap boundary violations.
export const scanSourceDirectory = (sourceDirectory = defaultSourceDirectory) => {
  const files = listSourceFiles(sourceDirectory);
  const failures = [];
  let candidateCount = 0;

  files.forEach(filePath => {
    const source = readFileSync(filePath, 'utf8');
    const candidates = extractClassCandidates(source);
    candidateCount += candidates.length;
    failures.push(...validateClassCandidates(source, candidates, {
      filePath: relative(clientRoot, filePath).replaceAll('\\', '/')
    }));
  });

  return {
    candidateCount,
    failures,
    fileCount: files.length
  };
};

// Formats violations with the safe steps required to extend the Bootstrap boundary.
export const formatGuardReport = ({ candidateCount, failures, fileCount }) => {
  if (!failures.length) {
    return `Bootstrap class guard passed: scanned ${candidateCount} class candidates in ${fileCount} source files.`;
  }

  const lines = ['Bootstrap class guard failed:'];
  failures.forEach(failure => {
    lines.push(`- ${failure.filePath}:${failure.line}: ${failure.reason}`);
  });
  lines.push(
    '',
    'Enable the required SCSS module or utility-map family first, then update the matching allowlist.',
    'For a finite runtime template, audit every outcome and add them to DYNAMIC_CLASS_ESCAPES.',
    'Do not allowlist a class merely to silence this guard.'
  );

  return lines.join('\n');
};

// Runs the Bootstrap class boundary check as a command-line program.
const run = () => {
  try {
    const report = scanSourceDirectory();
    console.log(formatGuardReport(report));
    if (report.failures.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Bootstrap class guard failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (resolve(process.argv[1] || '') === scriptPath) {
  run();
}
