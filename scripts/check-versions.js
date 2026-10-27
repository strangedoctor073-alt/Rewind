import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

const rootPkgPath = path.join(rootDir, 'package.json');
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
const expectedVersion = rootPkg.version;

if (!expectedVersion) {
  console.error('FAIL: root package.json has no version property');
  process.exit(1);
}

const errors = [];

// 1. extension/manifest.json
const manifestPath = path.join(rootDir, 'extension', 'manifest.json');
if (fs.existsSync(manifestPath)) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  if (manifest.version !== expectedVersion) {
    errors.push(`extension/manifest.json version is "${manifest.version}", expected "${expectedVersion}"`);
  }
} else {
  errors.push(`extension/manifest.json not found at ${manifestPath}`);
}

// 2. launcher/package.json
const launcherPkgPath = path.join(rootDir, 'launcher', 'package.json');
if (fs.existsSync(launcherPkgPath)) {
  const launcherPkg = JSON.parse(fs.readFileSync(launcherPkgPath, 'utf8'));
  if (launcherPkg.version !== expectedVersion) {
    errors.push(`launcher/package.json version is "${launcherPkg.version}", expected "${expectedVersion}"`);
  }
} else {
  errors.push(`launcher/package.json not found at ${launcherPkgPath}`);
}

// 3. README.md check
const readmePath = path.join(rootDir, 'README.md');
if (fs.existsSync(readmePath)) {
  const readme = fs.readFileSync(readmePath, 'utf8');
  if (readme.includes('v5.10.1')) {
    errors.push('README.md still references old version "v5.10.1"');
  }
}

if (errors.length > 0) {
  console.error('\n❌ Version Check Failed: Discrepancies detected:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  console.error('\nRun "npm run sync:versions" to harmonize all project manifests.\n');
  process.exit(1);
}

console.log(`✓ All version sources match root package.json: ${expectedVersion}`);
process.exit(0);
