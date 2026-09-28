import { cp, mkdir, rm } from 'node:fs/promises';
// dist is generated output; recreate it so removed features cannot survive a build.
await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });
await cp('public', 'dist', { recursive: true });
console.log('Static site built in dist/');
