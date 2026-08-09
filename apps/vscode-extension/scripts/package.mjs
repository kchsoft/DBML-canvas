import { cp, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// vsce lists files via `git ls-files` at the repository root, so running it
// directly inside this npm-workspace package pulls in unrelated sibling
// packages and repo-root files. Staging a self-contained copy outside the
// git working tree keeps the packaged .vsix scoped to this extension only.
const extensionDir = fileURLToPath(new URL('..', import.meta.url));
const stageDir = await mkdtemp(join(tmpdir(), 'dbml-canvas-vscode-'));

const filesToCopy = ['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md'];
const dirsToCopy = ['dist', 'media', 'icons'];

for (const file of filesToCopy) {
  await cp(join(extensionDir, file), join(stageDir, file));
}
for (const dir of dirsToCopy) {
  await cp(join(extensionDir, dir), join(stageDir, dir), {
    recursive: true,
    filter: (src) => !src.endsWith('.map'),
  });
}

const mode = process.argv[2] === 'publish' ? 'publish' : 'package';
const vsceArgs = mode === 'publish' ? ['publish'] : ['package', '--out', extensionDir];

// Resolve the workspace's own @vscode/vsce binary rather than `npx vsce`,
// which silently fetches the unrelated, deprecated standalone `vsce` package.
const vsceBin = join(extensionDir, '../../node_modules/.bin/vsce');

const result = spawnSync(vsceBin, vsceArgs, {
  cwd: stageDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

await rm(stageDir, { recursive: true, force: true });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

if (mode === 'package') {
  const vsix = (await readdir(extensionDir)).find((name) => name.endsWith('.vsix'));
  console.log(`\nPackaged: apps/vscode-extension/${vsix}`);
}
