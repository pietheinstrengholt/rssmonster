import { readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APPROVED_COLOR_EXCEPTIONS,
  EXCLUDED_COLOR_SOURCES,
  HARD_CODED_COLOR_BASELINE
} from './hard-coded-color-policy.js';

const scriptPath = fileURLToPath(import.meta.url);
const clientRoot = resolve(dirname(scriptPath), '..');
const defaultSourceDirectory = resolve(clientRoot, 'src');
const COLOR_SOURCE_EXTENSIONS = new Set(['.css', '.scss', '.vue']);
const CSS_NAMED_COLORS = (
  'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet '
  + 'brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue '
  + 'darkcyan darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange '
  + 'darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise '
  + 'darkviolet deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia '
  + 'gainsboro ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory '
  + 'khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow '
  + 'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray '
  + 'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue '
  + 'mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred '
  + 'midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid '
  + 'palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple '
  + 'rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue '
  + 'slateblue slategray slategrey snow springgreen steelblue tan teal thistle tomato turquoise violet wheat '
  + 'white whitesmoke yellow yellowgreen transparent currentcolor'
).split(' ');
const COLOR_LITERAL_PATTERN = new RegExp(
  `#[\\da-f]{3,8}\\b|\\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\\([^)]*\\)`
    + `|(?<![-\\w])(?:${CSS_NAMED_COLORS.join('|')})(?![-\\w])`,
  'gi'
);
const VUE_STYLE_BLOCK_PATTERN = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;

// Preserves offsets while excluding comments, strings, and URLs that do not set rendered colors.
const maskIgnoredCssText = source => source.replace(
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|url\([^)]*\)|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/gi,
  ignoredText => ignoredText.replace(/[^\n]/g, ' ')
);

// Produces stable keys despite harmless case and whitespace differences in color syntax.
export const normalizeColorLiteral = literal => literal.toLowerCase().replace(/\s+/g, '');

// Calculates a one-based line number without changing source offsets.
const lineNumberAt = (source, index) => source.slice(0, index).split('\n').length;

// Rejects selector fragments and other non-declaration text that resembles a color.
const isDeclarationValueAt = (source, index) => {
  const declarationStart = Math.max(source.lastIndexOf(';', index), source.lastIndexOf('{', index)) + 1;
  return source.slice(declarationStart, index).includes(':');
};

// Identifies literals used as the fallback argument of a CSS var() expression.
const isVarFallbackAt = (source, index) => {
  const declarationStart = Math.max(source.lastIndexOf(';', index), source.lastIndexOf('{', index)) + 1;
  const declarationPrefix = source.slice(declarationStart, index);
  const varStart = declarationPrefix.lastIndexOf('var(');

  if (varStart < 0) {
    return false;
  }

  const varPrefix = declarationPrefix.slice(varStart + 4);
  let depth = 0;
  let hasFallbackComma = false;

  for (const character of varPrefix) {
    if (character === '(') {
      depth += 1;
    } else if (character === ')') {
      if (depth === 0) {
        return false;
      }
      depth -= 1;
    } else if (character === ',' && depth === 0) {
      hasFallbackComma = true;
    }
  }

  return hasFallbackComma;
};

// Restricts Vue scanning to style blocks while retaining original file positions.
const extractScannableBlocks = (source, extension) => {
  if (extension !== '.vue') {
    return [{ content: source, offset: 0 }];
  }

  const blocks = [];
  let match;
  VUE_STYLE_BLOCK_PATTERN.lastIndex = 0;
  while ((match = VUE_STYLE_BLOCK_PATTERN.exec(source)) !== null) {
    blocks.push({
      content: match[1],
      offset: match.index + match[0].indexOf('>') + 1
    });
  }
  return blocks;
};

// Extracts source-located color literals from CSS/SCSS or Vue style blocks.
export const extractColorOccurrences = (source, { extension = '.css', filePath = '<source>' } = {}) => {
  const occurrences = [];

  extractScannableBlocks(source, extension).forEach(block => {
    const maskedContent = maskIgnoredCssText(block.content);
    let match;
    COLOR_LITERAL_PATTERN.lastIndex = 0;
    while ((match = COLOR_LITERAL_PATTERN.exec(maskedContent)) !== null) {
      const index = block.offset + match.index;
      if (!isDeclarationValueAt(maskedContent, match.index)) {
        continue;
      }
      const literal = source.slice(index, index + match[0].length);
      occurrences.push({
        filePath,
        index,
        isVarFallback: isVarFallbackAt(maskedContent, match.index),
        line: lineNumberAt(source, index),
        literal,
        normalizedLiteral: normalizeColorLiteral(literal)
      });
    }
  });

  return occurrences;
};

// Determines whether an occurrence is covered by one narrowly scoped durable exception.
const matchesException = (occurrence, exception) => (
  occurrence.filePath === exception.file
  && occurrence.normalizedLiteral === normalizeColorLiteral(exception.literal)
  && (exception.varFallback === undefined || occurrence.isVarFallback === exception.varFallback)
);

// Applies capped durable exceptions before comparing remaining legacy literals with the ratchet.
export const evaluateColorPolicy = (
  occurrences,
  {
    approvedExceptions = APPROVED_COLOR_EXCEPTIONS,
    baseline = HARD_CODED_COLOR_BASELINE
  } = {}
) => {
  const approved = new Set();

  approvedExceptions.forEach(exception => {
    const matches = occurrences.filter((occurrence, index) => (
      !approved.has(index) && matchesException(occurrence, exception)
    ));
    matches.slice(0, exception.maxOccurrences).forEach(occurrence => {
      approved.add(occurrences.indexOf(occurrence));
    });
  });

  const baselineGroups = new Map();
  occurrences.forEach((occurrence, index) => {
    if (approved.has(index)) {
      return;
    }
    const key = `${occurrence.filePath}\u0000${occurrence.normalizedLiteral}`;
    const group = baselineGroups.get(key) || [];
    group.push(occurrence);
    baselineGroups.set(key, group);
  });

  const failures = [];
  baselineGroups.forEach(group => {
    const { filePath, normalizedLiteral } = group[0];
    const allowedCount = baseline[filePath]?.[normalizedLiteral] || 0;
    failures.push(...group.slice(allowedCount));
  });

  return {
    approvedCount: approved.size,
    baselineCount: occurrences.length - approved.size - failures.length,
    failures,
    occurrenceCount: occurrences.length
  };
};

// Finds client-owned Vue, CSS, and SCSS sources without traversing generated output.
const listColorSourceFiles = directory => {
  const files = [];

  readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listColorSourceFiles(entryPath));
      return;
    }

    if (entry.isFile() && COLOR_SOURCE_EXTENSIONS.has(extname(entry.name))) {
      files.push(entryPath);
    }
  });

  return files;
};

// Scans the client source tree and evaluates every in-scope UI color literal.
export const scanColorSources = (
  sourceDirectory = defaultSourceDirectory,
  policy = {}
) => {
  const occurrences = [];
  let fileCount = 0;

  listColorSourceFiles(sourceDirectory).forEach(filePath => {
    const relativePath = relative(clientRoot, filePath).replaceAll('\\', '/');
    if (EXCLUDED_COLOR_SOURCES.has(relativePath)) {
      return;
    }

    const source = readFileSync(filePath, 'utf8');
    fileCount += 1;
    occurrences.push(...extractColorOccurrences(source, {
      extension: extname(filePath),
      filePath: relativePath
    }));
  });

  return {
    ...evaluateColorPolicy(occurrences, policy),
    fileCount
  };
};

// Formats failures with their exact location and the semantic-token remediation path.
export const formatColorGuardReport = report => {
  if (!report.failures.length) {
    return `Hard-coded color guard passed: scanned ${report.occurrenceCount} literals in ${report.fileCount} style sources.`;
  }

  const lines = ['Hard-coded color guard failed:'];
  report.failures.forEach(failure => {
    lines.push(`- ${failure.filePath}:${failure.line}: ${failure.literal}`);
  });
  lines.push(
    '',
    'Use an existing semantic CSS variable, or add a narrowly named light/dark token to src/assets/styles/theme.css.',
    'If the literal is an intentional durable exception, document and cap it in scripts/hard-coded-color-policy.js.'
  );
  return lines.join('\n');
};

// Runs the hard-coded UI color ratchet as a command-line program.
const run = () => {
  try {
    const report = scanColorSources();
    console.log(formatColorGuardReport(report));
    if (report.failures.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Hard-coded color guard failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (resolve(process.argv[1] || '') === scriptPath) {
  run();
}
