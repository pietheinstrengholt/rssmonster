var franc = require("franc-min");

exports.get = function(text) {
  if (text) {
    //remove html
    cleanText = text.replace(/<\/?[^>]+(>|$)/g, "");
    //return language
    return franc(text);
  }
};
