import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Inspect the index, so force-added files cannot bypass the repository contract.
const root = fileURLToPath(new URL('../../', import.meta.url));
const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
const forbidden = paths.filter(path => /(?:vectors\.json|\.(?:vectors|embeddings)(?:\.|$)|\.(?:onnx|safetensors)(?:\.|$)|(?:^|\/)(?:pinned-vectors|\.semantic-regression)\/)/i.test(path));
if (forbidden.length) {
  console.error(`Vector artifacts must never be committed:\n${forbidden.join('\n')}`);
  process.exitCode = 1;
} else {
  console.log('No tracked vector artifacts.');
}
