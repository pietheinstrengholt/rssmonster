var franc = require("franc");

exports.get = function(text) {
  if (text) {
    //remove html
    cleanText = text.replace(/<\/?[^>]+(>|$)/g, "");
    //return language
    return franc(text);
  }
};
