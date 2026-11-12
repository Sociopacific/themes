export const DEFAULT_FONT_FAMILIES = ['sans', 'monospace'] as const;
const fonts: Record<string, string[]> = {sans: ['Inter', 'Merriweather', 'Titillium Web'], monospace: ['Roboto Mono', 'Ubuntu Mono', 'IBM Plex Mono']};
export function isBuiltInFontFamily(type: string, name: string) {
    return Boolean(fonts[type]?.includes(name));
}
