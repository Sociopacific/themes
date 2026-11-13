import {createHash} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {chromium} from '@playwright/test';
import sharp from 'sharp';
import {readSubmissionInput} from './read-submission-input.mjs';

const require = createRequire(import.meta.url);
const {validateThemeMetadata} = require('../dist/schema.js');
const {validateThemePayload} = require('../dist/validation.js');
const {JOB_ID, THEME_HASH, RENDERER_REVISION, GITHUB_SHA, GITHUB_RUN_ID, USER_ID} = process.env;
if (!JOB_ID || !/^[a-f0-9-]{36}$/.test(JOB_ID) || !/^[a-f0-9]{40}$/.test(RENDERER_REVISION ?? '') ||
    GITHUB_SHA !== RENDERER_REVISION || !/^[a-f0-9]{64}$/.test(THEME_HASH ?? '') || !/^\d+$/.test(GITHUB_RUN_ID ?? '')) {
    throw new Error('Invalid renderer correlation');
}
if (!/^[1-9]\d*$/.test(USER_ID ?? '') || !Number.isSafeInteger(Number(USER_ID))) throw new Error('Invalid user id');
const input = readSubmissionInput(process.env.SUBMISSION);
validateThemeMetadata(input.metadata);
const payload = validateThemePayload(input.payload);
const hash = createHash('sha256').update(JSON.stringify({metadata: input.metadata, payload})).digest('hex');
if (hash !== THEME_HASH) {
    throw new Error('CI input correlation mismatch');
}
const browser = await chromium.launch({args: ['--font-render-hinting=none', '--force-color-profile=srgb', '--disable-lcd-text']});
const files = {}, hashes = {};
try {
    for (const mode of ['light', 'dark']) {
        const context = await browser.newContext({viewport: {width: 740, height: 375}, deviceScaleFactor: 2});
        // Theme values are validated; also block any renderer-initiated external network access.
        await context.route('**/*', (route) => new URL(route.request().url()).origin === 'http://127.0.0.1:3010' ? route.continue() : route.abort());
        const page = await context.newPage();
        await page.emulateMedia({colorScheme: mode, reducedMotion: 'reduce'});
        await page.goto('http://127.0.0.1:3010', {waitUntil: 'networkidle'});
        await page.waitForFunction(() => typeof window.renderTheme === 'function');
        await page.evaluate((data) => window.renderTheme(data), {payload, mode});
        await page.waitForFunction(() => document.documentElement.dataset.themePreviewReady === '1');
        const raw = await page.locator('#capture-root').screenshot({type: 'png'});
        const png = await sharp(raw).resize(740, 500, {fit: 'cover', position: 'left top', kernel: 'lanczos3'}).png({compressionLevel: 9, adaptiveFiltering: true}).toBuffer();
        files[mode] = png.toString('base64');
        hashes[mode] = createHash('sha256').update(png).digest('hex');
        await context.close();
    }
} finally {
    await browser.close();
}
await mkdir('output', {recursive: true});
await writeFile('output/result.json', JSON.stringify({userId: Number(USER_ID), input: {metadata: input.metadata, payload}, jobId: JOB_ID, runId: Number(GITHUB_RUN_ID), revision: RENDERER_REVISION, themeHash: THEME_HASH, files, hashes}));
