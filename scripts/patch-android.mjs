#!/usr/bin/env node
// Applies the two fixes the Capacitor-generated android/ project needs.
// android/ is not committed (it is generated with `cap add android`), so these
// edits would be lost on every fresh clone — this script re-applies them.
// Safe to run any number of times (idempotent). Run after `cap add android`
// / `cap sync android`:  bun run cap:patch   (or: bun run android:sync)
//
// 1. android/variables.gradle: rgcfaIncludeGoogle = true
//    @capacitor-firebase/authentication only bundles the Google Sign-In
//    libraries when this flag is set; without it Google login fails.
// 2. android/app/src/main/AndroidManifest.xml: ACCESS_COARSE_LOCATION +
//    ACCESS_FINE_LOCATION. @capacitor/geolocation does not add them, so the
//    shop GPS capture on the profile screen would be refused.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const android = join(root, 'android');

function fail(msg) {
  console.error(`patch-android: ${msg}`);
  process.exit(1);
}

if (!existsSync(android)) {
  fail('android/ not found — run `bun x cap add android` first.');
}

// 1. Google Sign-In libraries for @capacitor-firebase/authentication
const varsPath = join(android, 'variables.gradle');
if (!existsSync(varsPath)) fail(`${varsPath} not found.`);
let vars = readFileSync(varsPath, 'utf8');
if (/^\s*rgcfaIncludeGoogle\s*=\s*true\b/m.test(vars)) {
  console.log('patch-android: variables.gradle already has rgcfaIncludeGoogle = true');
} else if (/^\s*rgcfaIncludeGoogle\s*=/m.test(vars)) {
  vars = vars.replace(/^(\s*)rgcfaIncludeGoogle\s*=.*$/m, '$1rgcfaIncludeGoogle = true');
  writeFileSync(varsPath, vars);
  console.log('patch-android: variables.gradle rgcfaIncludeGoogle set to true');
} else if (/^ext\s*\{/m.test(vars)) {
  vars = vars.replace(/^ext\s*\{[^\S\r\n]*\r?\n/m, (m) => `${m}    rgcfaIncludeGoogle = true\n`);
  writeFileSync(varsPath, vars);
  console.log('patch-android: variables.gradle rgcfaIncludeGoogle = true added');
} else {
  fail('could not find the `ext {` block in android/variables.gradle.');
}

// 2. Location permissions for @capacitor/geolocation
const manifestPath = join(android, 'app', 'src', 'main', 'AndroidManifest.xml');
if (!existsSync(manifestPath)) fail(`${manifestPath} not found.`);
let manifest = readFileSync(manifestPath, 'utf8');
const missing = ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'].filter(
  (p) => !manifest.includes(`"android.permission.${p}"`),
);
if (missing.length === 0) {
  console.log('patch-android: AndroidManifest.xml already has location permissions');
} else {
  if (!manifest.includes('</manifest>')) fail('no </manifest> in AndroidManifest.xml.');
  const lines = missing
    .map((p) => `    <uses-permission android:name="android.permission.${p}" />\n`)
    .join('');
  manifest = manifest.replace('</manifest>', `${lines}</manifest>`);
  writeFileSync(manifestPath, manifest);
  console.log(`patch-android: AndroidManifest.xml added ${missing.join(', ')}`);
}
