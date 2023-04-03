import { franc } from 'franc-min';

export const get = (text) => {
  if (text) {
    //remove html
    var cleanText = text.replace(/<\/?[^>]+(>|$)/g, "");
    //return language
    return franc(cleanText);
  }
};

export default {
  get
}