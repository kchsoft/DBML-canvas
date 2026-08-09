import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external: ['vscode'],
  sourcemap: true,
  minify: true,
  logLevel: 'info',
});
