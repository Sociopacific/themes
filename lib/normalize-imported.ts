import {
    type ColorOptions,
    type GravityTheme,
    createInternalPrivateColorReference,
    createInternalUtilityColorReference,
    createTextCssVariable,
    getKeyFromCssFontVariable,
    getUtilityColorTypeFromCssVariable,
    isFontCssVariable,
    isPrivateColorCssVariable,
    isUtilityColorCssVariable,
    parsePrivateColorCssVariable,
} from '@gravity-ui/uikit-themer';
import type {ThemePayload} from './schema';

// Extracted from landing's normalizeImportedTheme import shim. Keep JSON refs
// in the internal grammar understood by the same pinned themer version.
const normalizeRef = (ref: unknown): string | undefined => {
    if (typeof ref !== 'string' || !ref) return undefined;
    if (isPrivateColorCssVariable(ref)) {
        try {
            const {mainColorToken, privateColorToken} = parsePrivateColorCssVariable(ref);
            return createInternalPrivateColorReference(mainColorToken, privateColorToken);
        } catch {
            return undefined;
        }
    }
    if (isUtilityColorCssVariable(ref)) {
        const utilityColor = getUtilityColorTypeFromCssVariable(ref);
        return utilityColor ? createInternalUtilityColorReference(utilityColor) : undefined;
    }
    return undefined;
};
const normalizeColorOptions = (options: ColorOptions | undefined): ColorOptions | undefined =>
    options ? {value: options.value, ref: normalizeRef(options.ref)} : options;
const isBlank = (options: ColorOptions | undefined) =>
    Boolean(options) && !options?.ref && !options?.value?.trim();

export function normalizeImportedTheme(theme: GravityTheme, payload?: ThemePayload): GravityTheme {
    for (const utilityColor of Object.values(theme.utilityColors)) {
        utilityColor.light = normalizeColorOptions(utilityColor.light) ?? utilityColor.light;
        utilityColor.dark = normalizeColorOptions(utilityColor.dark) ?? utilityColor.dark;
    }
    for (const mainTokenPrivates of Object.values(theme.privateColors)) {
        for (const variant of ['light', 'dark'] as const) {
            const palette = mainTokenPrivates[variant];
            for (const shade of Object.keys(palette)) {
                const key = shade as keyof typeof palette;
                if (isBlank(palette[key])) { delete palette[key]; continue; }
                const normalized = normalizeColorOptions(palette[key]);
                if (normalized) palette[key] = normalized;
            }
        }
    }
    for (const baseColor of Object.values(theme.baseColors)) {
        baseColor.light = normalizeColorOptions(baseColor.light) ?? baseColor.light;
        baseColor.dark = normalizeColorOptions(baseColor.dark) ?? baseColor.dark;
    }
    for (const [group, settings] of Object.entries(theme.typography.groups)) {
        const variable = createTextCssVariable({
            group: group as keyof typeof theme.typography.groups,
            property: 'font-family',
        });
        const ref = payload?.[variable]?.ref;
        if (typeof ref === 'string' && isFontCssVariable(ref)) {
            const family = getKeyFromCssFontVariable(ref);
            if (Object.hasOwn(theme.typography.fontFamilies, family)) settings['font-family'] = family;
        }
    }
    return theme;
}
