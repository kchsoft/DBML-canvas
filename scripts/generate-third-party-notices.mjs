import { access, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ENTRY_MANIFESTS = [
  'packages/core/package.json',
  'packages/renderer/package.json',
  'apps/host-webview/package.json',
];

const LOCAL_PACKAGE_NAMES = new Set([
  '@dbml-canvas/core',
  '@dbml-canvas/renderer',
  '@dbml-canvas/host-webview',
]);

const LICENSE_FALLBACKS = new Map([
  ['antlr4', 'legal/third-party/antlr4-LICENSE.txt'],
]);

async function readJson(filename) {
  return JSON.parse(await readFile(filename, 'utf8'));
}

async function exists(filename) {
  try {
    await access(filename);
    return true;
  } catch {
    return false;
  }
}

async function resolvePackageDirectory(repoRoot, fromDirectory, packageName) {
  let current = fromDirectory;
  while (true) {
    const candidate = path.join(current, 'node_modules', packageName);
    if (await exists(path.join(candidate, 'package.json'))) return realpath(candidate);
    if (current === repoRoot) break;
    const parent = path.dirname(current);
    if (parent === current || !parent.startsWith(repoRoot)) break;
    current = parent;
  }
  throw new Error(`Cannot resolve runtime dependency ${packageName} from ${fromDirectory}`);
}

async function readLicenseText(repoRoot, packageDirectory, packageName) {
  const filenames = (await readdir(packageDirectory))
    .filter((filename) => /^(?:licen[cs]e|copying)(?:\..*)?$/i.test(filename))
    .sort();
  if (filenames.length === 0) {
    const fallback = LICENSE_FALLBACKS.get(packageName);
    return fallback ? readFile(path.join(repoRoot, fallback), 'utf8') : undefined;
  }
  return readFile(path.join(packageDirectory, filenames[0]), 'utf8');
}

function repositoryUrl(value) {
  const raw = typeof value === 'string' ? value : value?.url;
  return raw?.replace(/^git\+/, '').replace(/\.git$/, '');
}

export async function generateThirdPartyNotices(repoRoot) {
  repoRoot = path.resolve(repoRoot);
  const packages = new Map();
  const visitedDirectories = new Set();

  async function visitManifest(manifestPath) {
    const packageDirectory = await realpath(path.dirname(manifestPath));
    if (visitedDirectories.has(packageDirectory)) return;
    visitedDirectories.add(packageDirectory);

    const manifest = await readJson(path.join(packageDirectory, 'package.json'));
    const isLocal = LOCAL_PACKAGE_NAMES.has(manifest.name);
    if (!isLocal) {
      const key = `${manifest.name}@${manifest.version}`;
      packages.set(key, {
        name: manifest.name,
        version: manifest.version,
        license: manifest.license ?? 'UNKNOWN',
        source: repositoryUrl(manifest.repository) ?? manifest.homepage ?? '',
        licenseText: await readLicenseText(repoRoot, packageDirectory, manifest.name),
      });
    }

    const runtimeDependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    };
    for (const dependencyName of Object.keys(runtimeDependencies).sort()) {
      const dependencyDirectory = await resolvePackageDirectory(
        repoRoot,
        packageDirectory,
        dependencyName,
      );
      await visitManifest(path.join(dependencyDirectory, 'package.json'));
    }
  }

  for (const relativeManifest of ENTRY_MANIFESTS) {
    await visitManifest(path.join(repoRoot, relativeManifest));
  }

  const sections = [...packages.values()]
    .sort((left, right) => `${left.name}@${left.version}`.localeCompare(`${right.name}@${right.version}`))
    .map((entry) => [
      '================================================================================',
      `${entry.name} ${entry.version}`,
      `License: ${entry.license}`,
      ...(entry.source ? [`Source: ${entry.source}`] : []),
      '',
      entry.licenseText?.trim() ?? 'The package did not include a standalone license file.',
    ].join('\n'));

  return [
    'DBML Canvas Third-Party Notices',
    '================================',
    '',
    'DBML Canvas includes open-source software listed below. Each component remains',
    'subject to its own license terms; those terms are not replaced by the DBML Canvas EULA.',
    '',
    'DBML Canvas includes @dbml/core from Holistics Software Pte Ltd. DBML Canvas is an',
    'independent product and is not affiliated with or endorsed by Holistics or dbdiagram.io.',
    '',
    ...sections,
    '',
  ].join('\n');
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] === currentFile) {
  const repoRoot = process.cwd();
  const outputFile = process.argv[2];
  if (!outputFile) throw new Error('Usage: node scripts/generate-third-party-notices.mjs <output-file>');
  const notices = await generateThirdPartyNotices(repoRoot);
  await mkdir(path.dirname(outputFile), { recursive: true });
  await writeFile(outputFile, notices, 'utf8');
}
