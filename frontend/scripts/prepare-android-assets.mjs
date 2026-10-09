import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const projectRoot = resolve(import.meta.dirname, '..');
const builtSite = resolve(projectRoot, 'dist');
const androidAssets = resolve(projectRoot, 'android/app/src/main/assets/public');

await rm(androidAssets, { recursive: true, force: true });
await mkdir(androidAssets, { recursive: true });
await cp(builtSite, androidAssets, { recursive: true });
console.log(`Bundled ${builtSite} into ${androidAssets}`);
