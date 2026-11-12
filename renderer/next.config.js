const {patchWebpackConfig} = require('next-global-css');
module.exports = {
    images: {unoptimized: true},
    transpilePackages: ['@gravity-ui/uikit', '@gravity-ui/navigation'],
    webpack(config, options) {
        patchWebpackConfig(config, options);
        config.module.rules.push({test: /\.svg$/, use: ['@svgr/webpack']});
        return config;
    },
};
