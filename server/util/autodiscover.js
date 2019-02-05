const cheerio = require("cheerio");
const fetch = require("node-fetch");

async function getUrl(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml'
      }
    });
    const body = await response.text();

    //TODO: fix situation where autoDiscoverUrl is not a valid url, but a directory
    if (body) {
      const $ = cheerio.load(body);
      if ($("head").find('link[type="application/rss+xml"]').length > 0) {
        autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
          "href"
        );
        url = autoDiscoverUrl;
      }
      if ($("head").find('link[type="application/atom+xml"]').length > 0) {
        autoDiscoverUrl = $('head link[type="application/atom+xml"]').attr(
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

exports.discover = async function (url) {
  try {
    const autodiscover = await getUrl(url);
    return autodiscover;
  } catch (err) {
    console.log(err);
  }
};