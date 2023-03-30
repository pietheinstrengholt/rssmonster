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
  }
};