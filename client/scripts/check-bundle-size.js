import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const scriptPath = fileURLToPath(import.meta.url);
const clientRoot = resolve(dirname(scriptPath), '..');
const defaultDistDirectory = resolve(clientRoot, 'dist');
const defaultManifestPath = resolve(defaultDistDirectory, '.vite/manifest.json');
const defaultBudgetPath = resolve(clientRoot, 'bundle-size-budgets.json');

// This function formats byte counts consistently for reports and failures.
export const formatBytes = bytes => `${(bytes / 1024).toFixed(2)} KiB`;

// This function locates the entry graph and stable manual chunks in a Vite manifest.
export const identifyBundleAssets = manifest => {
  const chunkEntries = Object.entries(manifest);
  const chunks = chunkEntries.map(([, chunk]) => chunk);
  const entryRecord = chunkEntries.find(([, chunk]) => chunk.isEntry && chunk.src === 'index.html')
    || chunkEntries.find(([, chunk]) => chunk.isEntry);
  const [entryKey, entry] = entryRecord || [];

  if (!entry?.file) {
    throw new Error('Could not identify the initial JavaScript entry in the Vite manifest.');
  }

  if (!Array.isArray(entry.css) || entry.css.length === 0) {
    throw new Error('Could not identify initial CSS assets in the Vite manifest.');
  }

  // This function requires a stable manual chunk name without relying on its content hash.
  const requireNamedChunk = name => {
    const chunk = chunks.find(candidate => candidate.name === name);

    if (!chunk?.file) {
      throw new Error(`Could not identify the "${name}" chunk in the Vite manifest.`);
    }

    return [chunk.file];
  };

  // This function follows static manifest imports and returns each initial JavaScript file once.
  const collectInitialJavaScript = (chunkKey, visited = new Set(), files = []) => {
    if (!chunkKey || visited.has(chunkKey)) return files;
    visited.add(chunkKey);

    const chunk = manifest[chunkKey];
    if (!chunk) return files;
    if (chunk.file?.endsWith('.js')) files.push(chunk.file);
    (chunk.imports || []).forEach(importedKey => {
      collectInitialJavaScript(importedKey, visited, files);
    });
    return files;
  };

  return {
    entryJavaScript: [entry.file],
    initialJavaScript: collectInitialJavaScript(entryKey),
    mainCss: entry.css,
    vueVendor: requireNamedChunk('vue-vendor'),
    axiosVendor: requireNamedChunk('axios-vendor')
  };
};

// This function measures separately served files as raw and gzip byte totals.
export const measureAssetFiles = (distDirectory, files) => files.reduce(
  (totals, relativePath) => {
    const assetPath = resolve(distDirectory, relativePath);

    if (!existsSync(assetPath)) {
      throw new Error(`Bundle asset is missing: ${relativePath}`);
    }

    const contents = readFileSync(assetPath);
    totals.rawBytes += contents.byteLength;
    totals.gzipBytes += gzipSync(contents).byteLength;
    return totals;
  },
  {
    files,
    gzipBytes: 0,
    rawBytes: 0
  }
);

// This function evaluates every measured bundle against both configured limits.
export const evaluateBundleBudgets = (measurements, budgets) => Object.entries(budgets)
  .flatMap(([key, budget]) => {
    const measurement = measurements[key];

    if (!measurement) {
      return [`${budget.label}: no measurement was produced.`];
    }

    const failures = [];
    const assetNames = measurement.files.join(', ');
    if (measurement.rawBytes > budget.rawBytes) {
      failures.push(
        `${budget.label} (${assetNames}) raw size ${formatBytes(measurement.rawBytes)} exceeds `
        + `${formatBytes(budget.rawBytes)}.`
      );
    }
    if (measurement.gzipBytes > budget.gzipBytes) {
      failures.push(
        `${budget.label} (${assetNames}) gzip size ${formatBytes(measurement.gzipBytes)} exceeds `
        + `${formatBytes(budget.gzipBytes)}.`
      );
    }

    return failures;
  });

// This function reads the build manifest and produces measurements for each budgeted asset.
export const createBundleReport = ({
  budgetPath = defaultBudgetPath,
  distDirectory = defaultDistDirectory,
  manifestPath = defaultManifestPath
} = {}) => {
  if (!existsSync(manifestPath)) {
    throw new Error(`Vite manifest not found at ${manifestPath}. Run npm run build first.`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const budgets = JSON.parse(readFileSync(budgetPath, 'utf8'));
  const identifiedAssets = identifyBundleAssets(manifest);
  const measurements = Object.fromEntries(
    Object.entries(identifiedAssets).map(([key, files]) => [
      key,
      measureAssetFiles(distDirectory, files)
    ])
  );

  return {
    budgets,
    failures: evaluateBundleBudgets(measurements, budgets),
    measurements
  };
};

// This function renders a readable bundle report for local use and CI logs.
export const formatBundleReport = ({ budgets, failures, measurements }) => {
  const lines = ['Production bundle sizes:'];

  Object.entries(budgets).forEach(([key, budget]) => {
    const measurement = measurements[key];
    lines.push(
      `- ${budget.label}: ${formatBytes(measurement.rawBytes)} raw / `
      + `${formatBytes(measurement.gzipBytes)} gzip `
      + `(limits ${formatBytes(budget.rawBytes)} raw / ${formatBytes(budget.gzipBytes)} gzip)`
    );
    lines.push(`  ${measurement.files.join(', ')}`);
  });

  if (failures.length) {
    lines.push('', 'Bundle size budget exceeded:');
    failures.forEach(failure => lines.push(`- ${failure}`));
  } else {
    lines.push('', 'All production bundle sizes are within budget.');
  }

  return lines.join('\n');
};

// This function runs the bundle check as a command-line program.
const run = () => {
  try {
    const report = createBundleReport();
    console.log(formatBundleReport(report));
    if (report.failures.length) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(`Bundle size check failed: ${error.message}`);
    process.exitCode = 1;
  }
};

if (resolve(process.argv[1] || '') === scriptPath) {
  run();
}
