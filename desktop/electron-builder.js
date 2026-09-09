// The staged app preserves desktop/ and server/ as siblings, just like development.
export default {
  appId: 'com.rssmonster.desktop',
  productName: 'RSSMonster',
  directories: { app: '.stage', output: 'release', buildResources: 'resources' },
  asar: { smartUnpack: false },
  asarUnpack: ['node_modules/sqlite3/build/Release/*.node'],
  npmRebuild: true,
  files: [
    'desktop/{main,runtime,database}.js',
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
    '!node_modules/sqlite3/{src,deps}/**/*'
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
    target: ['nsis'],
    icon: '../client/public/img/icons/apple-touch-icon-1024x1024.png',
    signExecutable: false
  },
  nsis: { artifactName: '${productName}-Setup-${version}-${arch}.${ext}' },
  linux: {
    target: ['AppImage', 'deb'],
    category: 'Network',
    icon: '../client/public/img/icons/android-chrome-512x512.png',
    executableName: 'rssmonster',
    maintainer: 'Piethein Strengholt'
  },
  publish: null
};
