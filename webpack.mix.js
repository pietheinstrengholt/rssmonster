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

//mix.setResourceRoot('../');
mix.setResourceRoot('/rssmonster/public/');

mix.browserSync();