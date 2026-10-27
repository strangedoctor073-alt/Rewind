import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const version = rootPkg.version;

if (!version) {
  console.error('Error: root package.json has no version');
  process.exit(1);
}

// 1. extension/manifest.json
const manifestPath = path.join(rootDir, 'extension', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  manifest.version = version;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  console.log(`Synced extension/manifest.json -> ${version}`);
}

// 2. launcher/package.json
const launcherPkgPath = path.join(rootDir, 'launcher', 'package.json');
if (fs.existsSync(launcherPkgPath)) {
  const launcherPkg = JSON.parse(fs.readFileSync(launcherPkgPath, 'utf8'));
  launcherPkg.version = version;
  fs.writeFileSync(launcherPkgPath, JSON.stringify(launcherPkg, null, 2) + '\n', 'utf8');
  console.log(`Synced launcher/package.json -> ${version}`);
}

// 3. src/App.tsx
const appTsxPath = path.join(rootDir, 'src', 'App.tsx');
if (fs.existsSync(appTsxPath)) {
  let content = fs.readFileSync(appTsxPath, 'utf8');
  content = content.replace(/<p>v[0-9.]+\s*\/\s*Local-first<\/p>/g, `<p>v${version} / Local-first</p>`);
  fs.writeFileSync(appTsxPath, content, 'utf8');
  console.log(`Synced src/App.tsx -> v${version}`);
}

console.log(`\nAll project versions synchronized to ${version}`);
