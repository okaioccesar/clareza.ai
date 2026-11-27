// Builds the static site into dist/. Usage: node scripts/build.mjs [--watch]
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { brand } from '../src/brand.ts';

const root = path.resolve(import.meta.dirname, '..');
const dist = path.join(root, 'dist');
const watch = process.argv.includes('--watch');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

// Static files and the HTML shell (with the product name filled in).
fs.cpSync(path.join(root, 'public'), dist, { recursive: true });
const html = fs
  .readFileSync(path.join(root, 'src/index.html'), 'utf8')
  .replaceAll('%BRAND%', brand.name)
  .replaceAll('%TAGLINE%', brand.tagline);
fs.writeFileSync(path.join(dist, 'index.html'), html);

const shared = {
  bundle: true,
  minify: !watch,
  sourcemap: watch ? 'inline' : false,
  target: ['es2022'],
  logLevel: 'info',
  legalComments: 'eof',
};
const builds = [
  { ...shared, entryPoints: { app: 'src/app/main.ts' }, format: 'iife', outdir: dist },
  { ...shared, entryPoints: { theme: 'src/theme.ts' }, format: 'iife', outdir: dist },
  { ...shared, entryPoints: { 'cloud-client': 'src/app/auth-client.ts' }, format: 'iife', outdir: dist },
  { ...shared, entryPoints: { app: 'src/styles/main.css' }, outdir: dist, external: ['*.svg'] },
];

if (watch) {
  for (const options of builds) await (await esbuild.context({ ...options, absWorkingDir: root })).watch();
  console.log('Observando alterações…');
} else {
  await Promise.all(builds.map((options) => esbuild.build({ ...options, absWorkingDir: root })));
}
