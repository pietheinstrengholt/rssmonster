import { verifyPackagedRuntime } from './verify-package.js';

// The staged app preserves desktop/, server/ and inference/ as siblings, just like development.
export default {
  appId: 'com.rssmonster.desktop',
  productName: 'RSSMonster',
  directories: { app: '.stage', output: 'release', buildResources: 'resources' },
  asar: { smartUnpack: false },
  asarUnpack: [
    'node_modules/sqlite3/build/Release/*.node',
    'node_modules/onnxruntime-node/bin/**/*',
    'node_modules/@img/**/*'
  ],
  npmRebuild: true,
  afterPack: context => verifyPackagedRuntime(context.packager.getResourcesDir(context.appOutDir)),
  files: [
    'desktop/{main,runtime,database,services,service-process,inference-config,storage}.js',
    'inference/src/**/*',
    'inference/package.json',
    'desktop/dist/**/*',
    'server/**/*',
    'LICENSE.md',
    '!**/{.git,.github,tests,test,__tests__,coverage,logs}/**/*',
    '!**/{.env,.env.*,*.sqlite,*.sqlite-*,*.db,*.log,*.map}',
    '!**/{README*,readme*,CHANGELOG*,changelog*,HISTORY*,History*,CONTRIBUTING*,CODE_OF_CONDUCT*,SECURITY*,AGENTS.md}',
    '!**/{docs,doc,examples,example,benchmarks,benchmark}/**/*',
    '!desktop/dist/.vite/**/*',
    '!**/fixtures/**/*',
    '!**/*.{spec,test}.js',
    '!**/*.d.{ts,cts,mts}',
    '!node_modules/json-schema-traverse/spec/**/*',
    '!node_modules/{node-gyp,node-addon-api,prebuild-install}/**/*',
    '!node_modules/sqlite3/{src,deps}/**/*',
    // Feedsmith vendors runtime code here; dependency collection skips nested node_modules.
    {
      from: 'node_modules/feedsmith/dist/node_modules',
      to: 'node_modules/feedsmith/dist/node_modules',
      filter: ['**/*.mjs', '**/*.cjs', '**/package.json']
    }
  ],
  artifactName: '${productName}-${version}-${arch}.${ext}',
  mac: {
    target: ['dir', 'dmg'],
    category: 'public.app-category.news',
    icon: '../client/public/img/icons/apple-touch-icon-1024x1024.png',
    identity: null,
    notarize: false
  },
  win: {
    target: ['nsis', 'portable'],
    icon: '../client/public/img/icons/apple-touch-icon-1024x1024.png',
    signExecutable: false
  },
  nsis: { artifactName: '${productName}-Setup-${version}-${arch}.${ext}' },
  portable: { artifactName: '${productName}-Portable-${version}-${arch}.${ext}' },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Network',
    icon: '../client/public/img/icons/android-chrome-512x512.png',
    executableName: 'rssmonster',
    maintainer: 'Piethein Strengholt'
  },
  publish: null
};
