import {createHmac} from 'node:crypto';
import {mkdir, writeFile} from 'node:fs/promises';

// Only this trusted download step receives the repository signing secret.
const {JOB_ID, USER_ID, INPUT_EXPIRES, LANDING_ORIGIN, THEMES_CI_INPUT_SECRET,
    RENDERER_REVISION, GITHUB_SHA, TRUSTED_RENDERER_REVISION} = process.env;
const expires = Number(INPUT_EXPIRES);
if (!/^[a-f0-9-]{36}$/.test(JOB_ID ?? '') || !/^[1-9]\d*$/.test(USER_ID ?? '') ||
    !Number.isSafeInteger(Number(USER_ID)) || !Number.isSafeInteger(expires) ||
    expires <= Date.now() || expires > Date.now() + 3600000 ||
    !/^[a-f0-9]{40}$/.test(RENDERER_REVISION ?? '') ||
    RENDERER_REVISION !== GITHUB_SHA || RENDERER_REVISION !== TRUSTED_RENDERER_REVISION ||
    !THEMES_CI_INPUT_SECRET || THEMES_CI_INPUT_SECRET.length < 32) {
    throw new Error('Invalid trusted input download configuration');
}
const origin = new URL(LANDING_ORIGIN);
if (origin.protocol !== 'https:' || origin.origin !== LANDING_ORIGIN || origin.username || origin.password) {
    throw new Error('Invalid trusted landing origin');
}
const signature = createHmac('sha256', THEMES_CI_INPUT_SECRET)
    .update(`${USER_ID}:${JOB_ID}:${expires}`).digest('hex');
const url = new URL('/api/themes/ci-input', origin);
url.search = new URLSearchParams({userId: USER_ID, jobId: JOB_ID, expires: String(expires), signature});
let response;
try {
    response = await fetch(url, {redirect: 'error', signal: AbortSignal.timeout(20000)});
} catch {
    // Fetch errors may contain the URL. Never propagate that bearer capability to logs.
    throw new Error('CI input download failed');
}
if (!response.ok) throw new Error('CI input unavailable');
const chunks = [];
let size = 0;
try {
    for await (const chunk of response.body) {
        size += chunk.length;
        if (size > 1024 * 1024) break;
        chunks.push(chunk);
    }
} catch {
    throw new Error('CI input download failed');
}
if (size > 1024 * 1024) throw new Error('CI input too large');
await mkdir('input', {recursive: true});
await writeFile('input/submission.json', Buffer.concat(chunks), {mode: 0o600});
