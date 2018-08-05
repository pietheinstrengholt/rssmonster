let mix = require('laravel-mix');

/*
 |--------------------------------------------------------------------------
 | Mix Asset Management
 |--------------------------------------------------------------------------
 |
 | Mix provides a clean, fluent API for defining some Webpack build steps
 | for your Laravel application. By default, we are compiling the Sass
 | file for the application as well as bundling up all the JS files.
 |
 */

mix.js('resources/assets/js/main.js', 'public/js');

mix.copy('resources/assets/images/', 'public/images/', false); // Don't flatten!

mix.setResourceRoot('../');
//mix.setResourceRoot('/rssmonster/public/');

mix.browserSync({
    notify: true,
    open: true,
    port: 8080,
    proxy: 'localhost:80'
});

let SWPrecacheWebpackPlugin = require('sw-precache-webpack-plugin');

mix.webpackConfig({
    resolve: {
        alias: {
            "@components" : path.resolve(__dirname, 'resources/assets/js/components'),
            "@root" : path.resolve(__dirname, 'resources/assets/js')
        }
    },
    plugins: [
        new SWPrecacheWebpackPlugin({
            cacheId: 'pwa',
            filename: 'js/service-worker.js',
            staticFileGlobs: ['public/**/*.{css,eot,svg,ttf,woff,woff2,js,html}'],
            minify: true,
            stripPrefix: 'public/',
            handleFetch: true,
            dynamicUrlToDependencies: {
                '/': ['resources/views/index.blade.php']
            },
            staticFileGlobsIgnorePatterns: [/\.map$/, /mix-manifest\.json$/, /manifest\.json$/, /service-worker\.js$/],
            runtimeCaching: [
                {
                    urlPattern: /^https:\/\/fonts\.googleapis\.com\//,
                    handler: 'cacheFirst'
                }
            ],
            //importScripts: ['./js/push_message.js']
        })
    ]
});