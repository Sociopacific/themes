
import {
    createPrivateColorCssVariable,
    createUtilityColorCssVariable,
    parseInternalPrivateColorReference,
    parseInternalUtilityColorReference,
} from '@gravity-ui/uikit-themer';
import chroma from 'chroma-js';

import {
    type ThemeMetadata,
    type ThemePayload,
    type ThemeTag,
    toThemeId,
    validateThemeMetadata,
} from './schema';
import {
    type SubmissionFieldErrors,
    cleanSubmissionText as cleanText,
    validateSubmissionDraft,
} from './draft';
import {DEFAULT_FONT_FAMILIES} from './fonts';
import {isBuiltInFontFamily} from './fonts';



// Shared validation for catalog entries and submitted themes.

export class SubmissionValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SubmissionValidationError';
    }
}

// Same rule as the submit form uses to show the id.
export interface ThemeMetaDraft {
    name: string;
    descriptionEn: string;
    descriptionRu: string;
    tags: string[];
    brandColor: string;
}

export interface SubmissionAuthor {
    login: string;
    name: string | null;
}

export class SubmissionMetadataError extends SubmissionValidationError {
    readonly fields: SubmissionFieldErrors;

    constructor(fields: SubmissionFieldErrors) {
        super('invalid metadata fields');
        this.fields = fields;
        this.name = 'SubmissionMetadataError';
    }
}

function normalizeBrandColor(value: unknown) {
    if (typeof value !== 'string' || !chroma.valid(value)) {
        throw new SubmissionValidationError('brandColor is not a color');
    }
    return chroma(value).hex('rgb').toUpperCase();
}

export function buildThemeMetadata(draft: unknown, author: SubmissionAuthor): ThemeMetadata {
    const fields = validateSubmissionDraft(draft);
    if (Object.keys(fields).length) {
        throw new SubmissionMetadataError(fields);
    }
    const value = draft as Record<keyof ThemeMetaDraft, unknown>;
    const name = cleanText(value.name);
    const id = toThemeId(name);
    const descriptionEn = cleanText(value.descriptionEn);
    const descriptionRu = cleanText(value.descriptionRu) || descriptionEn;
    const tags = Array.from(new Set(value.tags as ThemeTag[]));

    const metadata: ThemeMetadata = {
        id,
        name,
        author: {
            name: author.name?.trim() || author.login,
            url: `https://github.com/${author.login}`,
        },
        description: {en: descriptionEn, ru: descriptionRu},
        tags: tags as ThemeTag[],
        brandColor: normalizeBrandColor(value.brandColor),
    };

    try {
        validateThemeMetadata(metadata);
    } catch (error) {
        throw new SubmissionValidationError(error instanceof Error ? error.message : 'invalid');
    }
    return metadata;
}

const MAX_PAYLOAD_KEYS = 2000;
const MAX_VALUE_LENGTH = 500;
const PAYLOAD_KEY_RE = /^--[a-z][a-z0-9-]*$/;

// Values become CSS declarations in the isolated CI renderer and gallery,
// so each key accepts only the syntax its kind needs: no
// `url()`, `image-set()`, `@import` or any other function that fetches.
const COLOR_KEY_RE = /^--(?:g|gil)-color-/;
const FONT_FAMILY_KEY_PREFIX = '--g-font-family-';
const TEXT_FONT_FAMILY_KEY_RE = /^--g-text-[a-z0-9-]+-font-family$/;
// One color: hex (the Themer also keeps it without `#`), a named color or a
// single color function with numeric arguments; `chroma.valid` confirms it.
const COLOR_SYNTAX_RE =
    /^(?:#?[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\([\d\s.,%/+-]*\))$/i;
const COLOR_VAR_RE = /^var\(--g-[a-z0-9-]+\)$/;
// Sizes, font weights and keywords.
const PLAIN_VALUE_RE = /^(?:-?(?:\d+(?:\.\d*)?|\.\d+)(?:px|em|rem|%)?|[a-z][a-z-]*)$/i;
const FONT_NAME = `(?:'[\\w -]+'|"[\\w -]+"|[\\w-]+)`;
const FONT_FAMILY_VALUE_RE = new RegExp(`^${FONT_NAME}(?:\\s*,\\s*${FONT_NAME})*$`);
const BUILT_IN_FONT_REFS = DEFAULT_FONT_FAMILIES.map((type) => `${FONT_FAMILY_KEY_PREFIX}${type}`);

interface PayloadValue {
    value: string;
    ref?: string;
}

const isColorValue = (value: string) =>
    value === '' ||
    COLOR_VAR_RE.test(value) ||
    (COLOR_SYNTAX_RE.test(value) && chroma.valid(value));

// A font stack whose main font is a built-in font of the given family.
function isBuiltInFontStack(value: string, fontType: string) {
    if (!FONT_FAMILY_VALUE_RE.test(value)) {
        return false;
    }
    const mainFont = value
        .split(',')[0]
        .trim()
        .replace(/^['"]|['"]$/g, '');
    return isBuiltInFontFamily(fontType, mainFont);
}

function isValidLeaf(key: string, {value, ref}: PayloadValue) {
    if (ref !== undefined && !PAYLOAD_KEY_RE.test(ref)) {
        return false;
    }
    if (COLOR_KEY_RE.test(key)) {
        return isColorValue(value);
    }
    if (key.startsWith(FONT_FAMILY_KEY_PREFIX)) {
        return isBuiltInFontStack(value, key.slice(FONT_FAMILY_KEY_PREFIX.length));
    }
    if (TEXT_FONT_FAMILY_KEY_RE.test(key)) {
        return (
            ref !== undefined &&
            BUILT_IN_FONT_REFS.includes(ref) &&
            isBuiltInFontStack(value, ref.slice(FONT_FAMILY_KEY_PREFIX.length))
        );
    }
    return PLAIN_VALUE_RE.test(value);
}

function colorReference(value: string): string | undefined {
    const privateColor = parseInternalPrivateColorReference(value);
    if (privateColor && /^[a-z][a-z0-9-]*$/.test(privateColor.mainColorToken)) {
        return createPrivateColorCssVariable(
            privateColor.mainColorToken,
            privateColor.privateColorCode,
        );
    }
    const utilityColor = parseInternalUtilityColorReference(value);
    return utilityColor ? createUtilityColorCssVariable(utilityColor) : undefined;
}

function readPayloadValue(key: string, value: unknown): PayloadValue | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }
    const {value: itemValue, ref, ...rest} = value as Record<string, unknown>;
    if (
        Object.keys(rest).length ||
        typeof itemValue !== 'string' ||
        itemValue.length > MAX_VALUE_LENGTH ||
        (ref !== undefined && typeof ref !== 'string')
    ) {
        return null;
    }
    // generateJSON preserves unresolved internal references in `value`. Convert
    // only the library's private/utility reference grammar, never arbitrary CSS.
    const internalRef = COLOR_KEY_RE.test(key) ? colorReference(itemValue) : undefined;
    if (internalRef && ref !== undefined && ref !== internalRef) {
        return null;
    }
    const leaf: PayloadValue = {value: itemValue};
    if (internalRef) {
        leaf.value = `var(${internalRef})`;
        leaf.ref = internalRef;
    } else if (ref !== undefined) {
        leaf.ref = ref;
    }
    return isValidLeaf(key, leaf) ? leaf : null;
}

// Checks the `generateJSON` output sent by the browser and rebuilds it from
// known fields only. An entry is either `{value, ref?}` or a per-mode
// `{light?, dark?}` pair of those; the key order of the input is kept.
export function validateThemePayload(value: unknown): ThemePayload {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new SubmissionValidationError('theme must be an object');
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (!entries.length || entries.length > MAX_PAYLOAD_KEYS) {
        throw new SubmissionValidationError('theme has an unexpected number of variables');
    }
    const payload: Record<string, unknown> = {};
    for (const [key, item] of entries) {
        if (!PAYLOAD_KEY_RE.test(key) || !item || typeof item !== 'object') {
            throw new SubmissionValidationError(`unexpected theme variable ${key}`);
        }
        const record = item as Record<string, unknown>;
        if ('value' in record) {
            const leaf = readPayloadValue(key, record);
            if (!leaf) {
                throw new SubmissionValidationError(`invalid value of ${key}`);
            }
            payload[key] = leaf;
            continue;
        }
        const {light, dark, ...rest} = record;
        const themed: Record<string, PayloadValue> = {};
        for (const [mode, modeValue] of [
            ['light', light],
            ['dark', dark],
        ] as const) {
            if (modeValue === undefined) {
                continue;
            }
            const leaf = readPayloadValue(key, modeValue);
            if (!leaf) {
                throw new SubmissionValidationError(`invalid ${mode} value of ${key}`);
            }
            themed[mode] = leaf;
        }
        if (Object.keys(rest).length || !Object.keys(themed).length) {
            throw new SubmissionValidationError(`invalid value of ${key}`);
        }
        payload[key] = themed;
    }
    if (!payload['--g-color-base-brand']) {
        throw new SubmissionValidationError('theme has no brand color');
    }
    return normalizeColorReferences(payload);
}

function normalizeColorReferences(payload: Record<string, unknown>): ThemePayload {
    const resolve = (key: string, mode: 'light' | 'dark', visiting: Set<string>): string => {
        if (visiting.has(key)) {
            throw new SubmissionValidationError(`circular color reference ${key}`);
        }
        const entry = payload[key] as
            | PayloadValue
            | Partial<Record<'light' | 'dark', PayloadValue>>
            | undefined;
        const leaf = entry && ('value' in entry ? entry : entry[mode]);
        if (!leaf || !COLOR_KEY_RE.test(key)) {
            throw new SubmissionValidationError(`missing color reference ${key}`);
        }
        const target = COLOR_VAR_RE.test(leaf.value) ? leaf.value.slice(4, -1) : undefined;
        if (!target) {
            return leaf.value;
        }
        const result = resolve(target, mode, new Set([...visiting, key]));
        if (!result) {
            throw new SubmissionValidationError(`empty color reference ${target}`);
        }
        return result;
    };
    const normalized = {...payload};
    for (const key of Object.keys(payload).filter((name) => COLOR_KEY_RE.test(name))) {
        const entry = payload[key] as
            | PayloadValue
            | Partial<Record<'light' | 'dark', PayloadValue>>;
        const normalize = (leaf: PayloadValue, mode: 'light' | 'dark'): PayloadValue =>
            COLOR_VAR_RE.test(leaf.value)
                ? {value: resolve(key, mode, new Set()), ref: leaf.value.slice(4, -1)}
                : leaf;
        if ('value' in entry) {
            if (COLOR_VAR_RE.test(entry.value)) {
                normalized[key] = {
                    light: normalize(entry, 'light'),
                    dark: normalize(entry, 'dark'),
                };
            }
        } else {
            const themed: Partial<Record<'light' | 'dark', PayloadValue>> = {};
            for (const mode of ['light', 'dark'] as const) {
                const leaf = entry[mode];
                if (leaf) {
                    themed[mode] = normalize(leaf, mode);
                }
            }
            normalized[key] = themed;
        }
    }
    return normalized as ThemePayload;
}
