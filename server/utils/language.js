// Detects the language of feed text after stripping HTML tags.
// This wraps franc-min behind a tiny helper used by server-side content processing.
import { franc } from 'franc-min';

// Returns the franc language code for cleaned text when input is present.
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
