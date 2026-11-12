import React from 'react';
import {generateCSS, parseJSON} from '@gravity-ui/uikit-themer';
import {PreviewLayout} from '../components/PreviewLayout';
import {TablePreview} from '../components/TablePreview';
import {normalizeImportedTheme} from '../../lib/normalize-imported';

// Same scoped selectors as landing's original CardPreviewStage.
const scopeCss = (css: string, name: string) => css
    .replace('.g-root {', `.g-root.${name}, .${name} .g-root {`)
    .replace('.g-root_theme_dark {', `.g-root_theme_dark.${name}_theme_dark, .${name}_theme_dark .g-root_theme_dark {`)
    .replace('.g-root_theme_light {', `.g-root_theme_light.${name}_theme_light, .${name}_theme_light .g-root_theme_light {`);
export default function Capture() {
    const [data, setData] = React.useState<{payload: any; mode: 'light' | 'dark'} | null>(null);
    React.useEffect(() => {
        (window as any).renderTheme = setData;
    }, []);
    React.useEffect(() => {
        if (!data) return;
        document.fonts.ready.then(() => requestAnimationFrame(() => requestAnimationFrame(() => {
            document.documentElement.dataset.themePreviewReady = '1';
        })));
    }, [data]);
    if (!data) return null;
    const css = generateCSS({theme: normalizeImportedTheme(parseJSON(data.payload), data.payload), ignoreDefaultValues: false, forPreview: true, libraries: ['illustrations']});
    return <div id="capture-root" className={`g-root g-root_theme_${data.mode}`} style={{width: 555, height: 375, overflow: 'hidden', background: 'var(--g-color-base-background)'}}>
        <style>{scopeCss(css, 'gravity-ui-landing-themes-preview-layout')}</style>
        <style>{scopeCss(css, 'gravity-ui-landing-themes-preview-wrapper')}</style><div style={{width: 740}}><PreviewLayout id="table" title="Table" breadCrumbsItems={['Table']} initialTheme={data.mode}>{(props) => <TablePreview {...props} />}</PreviewLayout></div>
    </div>;
}
