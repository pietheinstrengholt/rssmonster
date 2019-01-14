const cheerio = require("cheerio");
const fetch = require("node-fetch");

async function getUrl(url) {
  try {
    const response = await fetch(url);
    const body = await response.text();
    if (body) {
      const $ = cheerio.load(body);
      if ($("head").find('link[type="application/rss+xml"]').length == 1) {
        autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
          "href"
        );
        url = autoDiscoverUrl;
      }
    }
    return url;
  } catch (err) {
    console.log(err);
  }
}

exports.discover = async function(url) {
  try {
    const autodiscover = await getUrl(url);
    return autodiscover;
  } catch (err) {
    console.log(err);
  }
};
