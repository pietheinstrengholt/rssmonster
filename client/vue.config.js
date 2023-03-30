module.exports = {
  runtimeCompiler: true, //debug, for production set to false
  pwa: {
    themeColor: "#000000",
    msTileColor: "#000000",
    appleMobileWebAppCapable: 'yes',
    appleMobileWebAppStatusBarStyle: 'black',
    appleMobileWebAppCache: "yes",
    manifestOptions: {
      background_color: "#ffffff"
    }
  },
  chainWebpack: config => {
    config.resolve.alias.set('vue', '@vue/compat')
    config.module
      .rule('vue')
      .use('vue-loader')
      .tap(options => {
        return {
          ...options,
          compilerOptions: {
            isCustomElement: tag => tag.startsWith('b-icon'), //https://stackoverflow.com/questions/66561885/how-to-set-vue-template-compiler-options-and-where
            compatConfig: {
            MODE: 2
          }
        }
      }
    })
  }
};