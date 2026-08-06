import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const clientRoot = resolve(dirname(scriptPath), '..');
const defaultSourceDirectory = resolve(clientRoot, 'src');
const defaultRootFiles = [resolve(clientRoot, 'index.html'), resolve(clientRoot, 'vite.config.js')];

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
  { family: 'forms', pattern: /^(?:form|input-group|is-(?:valid|invalid)|valid|invalid|was-validated)(?:-|$)/ },
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
  { family: 'type', pattern: /^(?:(?:blockquote|display-[1-6]|initialism|lead|list-inline|mark)(?:-|$)|small$)/ },
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
  { family: 'display', pattern: /^d(?:-(?:sm|md|lg|xl|xxl))?-(?:none|inline|inline-block|block|grid|inline-grid|table|table-row|table-cell|flex|inline-flex)$/ },
  { family: 'shadow', pattern: /^shadow(?:-sm|-lg|-none)?$/ },
  { family: 'focus-ring', pattern: /^focus-ring(?:-|$)/ },
  { family: 'position', pattern: /^(?:position-(?:static|relative|absolute|fixed|sticky)|(?:top|bottom|start|end)-(?:0|50|100)|translate-middle(?:-[xy])?)$/ },
  { family: 'border', pattern: /^border(?:-(?:top|end|bottom|start))?(?:-(?:0|1|2|3|4|5|primary|secondary|success|info|warning|danger|light|dark|black|white))?$/ },
  { family: 'border', pattern: /^rounded(?:-(?:top|end|bottom|start|circle|pill|0|1|2|3|4|5))?$/ },
  { family: 'sizing', pattern: /^(?:(?:w|h)-(?:25|50|75|100|auto)|(?:mw|mh|vw|vh)-100|min-v[wh]-100)$/ },
  { family: 'flex-grow', pattern: /^flex(?:-(?:sm|md|lg|xl|xxl))?-grow-[01]$/ },
  { family: 'justify-content', pattern: /^justify-content(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|between|around|evenly)$/ },
  { family: 'align-items', pattern: /^align-items(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|baseline|stretch)$/ },
  { family: 'align-self', pattern: /^align-self(?:-(?:sm|md|lg|xl|xxl))?-(?:auto|start|end|center|baseline|stretch)$/ },
  { family: 'flex', pattern: /^(?:flex(?:-(?:sm|md|lg|xl|xxl))?-(?:row|row-reverse|column|column-reverse|grow-0|grow-1|shrink-0|shrink-1|wrap|nowrap|wrap-reverse|fill)|align-content(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center|between|around|stretch)|order(?:-(?:sm|md|lg|xl|xxl))?-(?:first|last|0|1|2|3|4|5))$/ },
  { family: 'spacing', pattern: /^(?:m[trblxyse]?|p[trblxyse]?)(?:-(?:sm|md|lg|xl|xxl))?-(?:n?[0-5]|auto)$/ },
  { family: 'gap', pattern: /^(?:gap|row-gap|column-gap)(?:-(?:sm|md|lg|xl|xxl))?-[0-5]$/ },
  { family: 'text', pattern: /^(?:font-(?:monospace|sans-serif|serif)|fs-[1-6]|fst-(?:italic|normal)|lh-(?:1|sm|base|lg))$/ },
  { family: 'font-weight', pattern: /^fw-(?:lighter|light|normal|medium|semibold|bold|bolder)$/ },
  { family: 'text', pattern: /^text(?:-(?:sm|md|lg|xl|xxl))?-(?:start|end|center)$/ },
  { family: 'text', pattern: /^text-(?:lowercase|uppercase|capitalize|wrap|nowrap|break|decoration-none|decoration-underline|decoration-line-through)$/ },
  { family: 'color', pattern: /^text-(?:primary|secondary|success|info|warning|danger|light|dark|black|white|body|muted|black-50|white-50|body-secondary|body-tertiary|body-emphasis|reset)(?:-emphasis)?$/ },
  { family: 'background', pattern: /^(?:text-opacity-(?:25|50|75|100)|bg-(?:primary|secondary|success|info|warning|danger|light|dark|black|white|body|transparent|body-secondary|body-tertiary)(?:-subtle)?|bg-opacity-(?:10|25|50|75|100)|bg-gradient)$/ },
  { family: 'interaction', pattern: /^(?:user-select-(?:all|auto|none)|pe-(?:auto|none)|visible|invisible|z-(?:n1|0|1|2|3))$/ }
];

const STATIC_CLASS_ATTRIBUTE_PATTERN = /(?<![:\w-])class\s*=\s*(["'])([\s\S]*?)\1/g;
const BOUND_CLASS_ATTRIBUTE_PATTERN = /(?:^|\s)(?::class|v-bind:class)\s*=\s*(["'])([\s\S]*?)\1/g;
const STRING_LITERAL_PATTERN = /(["'`])([^"'`]*?)\1/g;
const RETURN_EXPRESSION_PATTERN = /\breturn\s+([^;]+);/g;
const ARROW_STRING_PATTERN = /=>\s*(["'`])([^"'`]*?)\1/g;
const STYLE_BLOCK_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style>/g;
const CSS_CLASS_SELECTOR_PATTERN = /\.([A-Za-z_-][\w-]*)/g;
const DYNAMIC_SEGMENT_PATTERN = /\$\{[^}]+\}/g;
const DATA_BS_ATTRIBUTE_PATTERN = /\b(data-bs-[\w-]+)\s*=/g;
const BOOTSTRAP_CSS_VARIABLE_PATTERN = /(--bs-[\w-]+)/g;
const BOOTSTRAP_API_PATTERN = /\bbootstrap\.(Alert|Button|Carousel|Collapse|Dropdown|Modal|Offcanvas|Popover|ScrollSpy|Tab|Toast|Tooltip)\b/g;
const FRAMEWORK_MODULE_SOURCE = '(bootstrap(?:\\/[^"\']*)?|bootswatch(?:\\/[^"\']*)?|@popperjs\\/core(?:\\/[^"\']*)?)';
const FRAMEWORK_IMPORT_PATTERNS = [
  new RegExp(`\\bimport\\s+(?:[^'"\\n;]+?\\s+from\\s+)?(["'])${FRAMEWORK_MODULE_SOURCE}\\1`, 'g'),
  new RegExp(`\\bimport\\s*\\(\\s*(["'])${FRAMEWORK_MODULE_SOURCE}\\1\\s*\\)`, 'g'),
  new RegExp(`\\brequire\\s*\\(\\s*(["'])${FRAMEWORK_MODULE_SOURCE}\\1\\s*\\)`, 'g'),
  new RegExp(`@(?:use|import)\\s+(?:url\\(\\s*)?(["'])${FRAMEWORK_MODULE_SOURCE}\\1`, 'g')
];

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
  while ((match = STRING_LITERAL_PATTERN.exec(expression)) !== null) values.push(match[2]);
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
    extractBoundClassStrings(match[2]).forEach(value => addClassTokens(
      candidates, value, match.index, 'bound class string'
    ));
  }
  RETURN_EXPRESSION_PATTERN.lastIndex = 0;
  while ((match = RETURN_EXPRESSION_PATTERN.exec(source)) !== null) {
    extractBoundClassStrings(match[1]).forEach(value => addClassTokens(
      candidates, value, match.index, 'returned class string'
    ));
  }
  ARROW_STRING_PATTERN.lastIndex = 0;
  while ((match = ARROW_STRING_PATTERN.exec(source)) !== null) {
    addClassTokens(candidates, match[2], match.index, 'returned class string');
  }
  return candidates;
};

// Extracts class selectors from CSS or Vue style blocks for compatibility-style enforcement.
export const extractStyleClassCandidates = (source, extension = '.css') => {
  const candidates = [];
  const fragments = [];
  if (extension === '.vue') {
    let styleMatch;
    STYLE_BLOCK_PATTERN.lastIndex = 0;
    while ((styleMatch = STYLE_BLOCK_PATTERN.exec(source)) !== null) {
      fragments.push({ source: styleMatch[1], offset: styleMatch.index + styleMatch[0].indexOf(styleMatch[1]) });
    }
  } else if (['.css', '.scss'].includes(extension)) {
    fragments.push({ source, offset: 0 });
  }

  fragments.forEach(fragment => {
    let classMatch;
    CSS_CLASS_SELECTOR_PATTERN.lastIndex = 0;
    while ((classMatch = CSS_CLASS_SELECTOR_PATTERN.exec(fragment.source)) !== null) {
      candidates.push({
        className: classMatch[1],
        index: fragment.offset + classMatch.index,
        origin: 'style class selector'
      });
    }
  });
  return candidates;
};

// Extracts declarative Bootstrap runtime attributes from one source file.
export const extractDataBsAttributes = source => {
  const candidates = [];
  let match;
  DATA_BS_ATTRIBUTE_PATTERN.lastIndex = 0;
  while ((match = DATA_BS_ATTRIBUTE_PATTERN.exec(source)) !== null) {
    candidates.push({ value: match[1], index: match.index, origin: 'Bootstrap data attribute' });
  }
  return candidates;
};

// Extracts framework imports while deliberately excluding the independent bootstrap-icons package.
export const extractForbiddenFrameworkImports = source => {
  const candidates = [];
  FRAMEWORK_IMPORT_PATTERNS.forEach(pattern => {
    pattern.lastIndex = 0;
    let match;
    while ((match = pattern.exec(source)) !== null) {
      candidates.push({ value: match[2], index: match.index, origin: 'retired framework import' });
    }
  });
  return candidates;
};

// Extracts Bootstrap-owned CSS custom properties from application styles.
export const extractBootstrapCssVariables = source => {
  const candidates = [];
  let match;
  BOOTSTRAP_CSS_VARIABLE_PATTERN.lastIndex = 0;
  while ((match = BOOTSTRAP_CSS_VARIABLE_PATTERN.exec(source)) !== null) {
    candidates.push({ value: match[1], index: match.index, origin: 'Bootstrap CSS variable' });
  }
  return candidates;
};

// Extracts direct use of Bootstrap's global JavaScript component API.
export const extractBootstrapApis = source => {
  const candidates = [];
  let match;
  BOOTSTRAP_API_PATTERN.lastIndex = 0;
  while ((match = BOOTSTRAP_API_PATTERN.exec(source)) !== null) {
    candidates.push({ value: `bootstrap.${match[1]}`, index: match.index, origin: 'Bootstrap JavaScript API' });
  }
  return candidates;
};

// Resolves a recognized Bootstrap class to its former component or utility family.
export const classifyBootstrapClass = className => {
  const component = COMPONENT_CLASSIFIERS.find(classifier => classifier.pattern.test(className));
  if (component) return { family: component.family, kind: 'component' };
  const utility = UTILITY_CLASSIFIERS.find(classifier => classifier.pattern.test(className));
  return utility ? { family: utility.family, kind: 'utility' } : null;
};

// Calculates a one-based line number for an extracted candidate.
const lineNumberAt = (source, index) => source.slice(0, index).split('\n').length;

// Rejects every recognized Bootstrap class, including unresolved runtime templates.
export const validateClassCandidates = (
  source,
  candidates,
  { filePath = '<source>' } = {}
) => candidates.flatMap(candidate => {
  const normalizedClass = candidate.className.includes('${')
    ? candidate.className.replace(DYNAMIC_SEGMENT_PATTERN, 'dynamic')
    : candidate.className;
  const classification = classifyBootstrapClass(normalizedClass);
  if (!classification) return [];
  return [{
    ...candidate,
    classification,
    filePath,
    line: lineNumberAt(source, candidate.index),
    reason: `"${candidate.className}" belongs to retired Bootstrap ${classification.kind} family "${classification.family}".`
  }];
});

// Rejects framework imports, runtime attributes, CSS variables, and global Bootstrap APIs.
export const validateForbiddenFrameworkUsage = (
  source,
  { filePath = '<source>' } = {}
) => [
  ...extractForbiddenFrameworkImports(source),
  ...extractDataBsAttributes(source),
  ...extractBootstrapCssVariables(source),
  ...extractBootstrapApis(source)
].map(candidate => ({
  ...candidate,
  className: candidate.value,
  filePath,
  line: lineNumberAt(source, candidate.index),
  reason: `${candidate.origin} "${candidate.value}" is not allowed after Bootstrap retirement.`
}));

// Finds application source files without traversing dependencies or generated output.
const listSourceFiles = directory => {
  const files = [];
  readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listSourceFiles(entryPath));
    else if (entry.isFile() && ['.css', '.html', '.js', '.scss', '.vue'].includes(extname(entry.name))) {
      files.push(entryPath);
    }
  });
  return files;
};

// Scans production source and build entry configuration for retired Bootstrap usage.
export const scanSourceDirectory = (
  sourceDirectory = defaultSourceDirectory,
  rootFiles = sourceDirectory === defaultSourceDirectory ? defaultRootFiles : []
) => {
  const files = [...listSourceFiles(sourceDirectory), ...rootFiles];
  const failures = [];
  let candidateCount = 0;
  files.forEach(filePath => {
    const source = readFileSync(filePath, 'utf8');
    const candidates = [
      ...extractClassCandidates(source),
      ...extractStyleClassCandidates(source, extname(filePath))
    ];
    const relativeFilePath = relative(clientRoot, filePath).replaceAll('\\', '/');
    candidateCount += candidates.length;
    failures.push(...validateClassCandidates(source, candidates, { filePath: relativeFilePath }));
    failures.push(...validateForbiddenFrameworkUsage(source, { filePath: relativeFilePath }));
  });
  return { candidateCount, failures, fileCount: files.length };
};

// Formats zero-usage violations for local and CI output.
export const formatGuardReport = ({ candidateCount, failures, fileCount }) => {
  if (!failures.length) {
    return `Bootstrap retirement guard passed: scanned ${candidateCount} class candidates in ${fileCount} production files.`;
  }
  return [
    'Bootstrap retirement guard failed:',
    ...failures.map(failure => `- ${failure.filePath}:${failure.line}: ${failure.reason}`),
    '',
    'Use an RSSMonster-owned primitive or selector. Bootstrap Icons remain allowed through bootstrap-icons.'
  ].join('\n');
};

// Runs the Bootstrap retirement check as a command-line program.
const run = () => {
  try {
    const report = scanSourceDirectory();
    console.log(formatGuardReport(report));
    if (report.failures.length) process.exitCode = 1;
  } catch (error) {
    console.error(`Bootstrap retirement guard failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (resolve(process.argv[1] || '') === scriptPath) run();
