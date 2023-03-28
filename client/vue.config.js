module.exports = {
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
            compatConfig: {
            MODE: 2
          }
        }
      }
    })
  },
};

const { defineConfig } = require('@vue/cli-service')
module.exports = defineConfig({
  transpileDependencies: true,
  devServer: {
    port: 8080,
  },
})