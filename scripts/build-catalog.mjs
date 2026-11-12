import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {validateThemeMetadata} = require('../dist/schema.js');
const {validateThemePayload} = require('../dist/validation.js');
const themes = [];
const names = new Set();
for (const file of (await readdir('themes')).filter((name) => name.endsWith('.meta.json')).sort()) {
    const metadata = JSON.parse(await readFile(`themes/${file}`, 'utf8'));
    validateThemeMetadata(metadata);
    if (names.has(metadata.name.trim().toLowerCase())) throw new Error('Duplicate theme name');
    names.add(metadata.name.trim().toLowerCase());
    const payload = validateThemePayload(JSON.parse(await readFile(`themes/${metadata.id}.theme.json`, 'utf8')));
    const previews = {};
    for (const mode of ['light', 'dark']) previews[mode] = 'data:image/png;base64,' + (await readFile(`previews/${metadata.id}-${mode}.png`)).toString('base64');
    themes.push({metadata, payload, previews});
}
await mkdir('dist', {recursive: true});
await writeFile('dist/catalog.json', JSON.stringify(themes));
await writeFile('dist/catalog.d.ts', "import type {ThemeMetadata, ThemePayload} from './schema';\ndeclare const catalog: {metadata: ThemeMetadata; payload: ThemePayload; previews: Record<'light' | 'dark', string>}[];\nexport = catalog;\n");
