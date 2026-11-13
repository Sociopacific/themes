import {inflateRawSync} from 'node:zlib';

// The workflow passes data through the environment, never through shell source.
export function readSubmissionInput(encoded) {
    if (typeof encoded !== 'string' || encoded.length > 65535 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
        throw new Error('Invalid submission transport');
    }
    const bytes = inflateRawSync(Buffer.from(encoded, 'base64'), {maxOutputLength: 1024 * 1024});
    return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}
