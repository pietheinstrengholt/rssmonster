import cheerio from "cheerio";
import fetch from "node-fetch";
//import http and https, needed for setting the agents for node-fetch
import http from 'http';
import https from 'https';

http.globalAgent.maxSockets = 1000000;
https.globalAgent.maxSockets = 1000000;

//function to return overlap
export const findOverlap = (a, b) => {
  if (b.length === 0) {
    return "";
  }
  if (a.endsWith(b)) {
    return b;
  }
  if (a.indexOf(b) >= 0) {
    return b;
  }
  return findOverlap(a, b.substring(0, b.length - 1));
}

//function to validate if url is valid
export const isURL = (url) => {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#:.?+=&%!\-\/]))?/;
  if (!regex.test(str)) {
    return false;
  } else {
    return true;
  }
}

export const getUrl = async (url) => {
  try {

    //set httpAgents
    const httpAgent = new http.Agent({
      keepAlive: true
    });
    const httpsAgent = new https.Agent({
      keepAlive: true
    });

    const options = {
      agent: function(_parsedURL) {
        if (_parsedURL.protocol == 'http:') {
          return httpAgent;
        } else {
          return httpsAgent;
        }
      },
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36",
        Accept: "text/html,application/xhtml+xml",
        Connection: 'keep-alive'
      }
    };

    //fetch url by using proper user agent
    const response = await fetch(url, options);

    if (response.ok) {

      //set body text, needed for cheerio for trying to retrieve rss link
      const body = await response.text();
      //return response url, in case the url has been changed
      const responseUrl = response.url;

      //validate body
      if (body) {
        //load body into cheerio
        //dismiss "cheerio.load() expects a string" by converting to string
        const $ = cheerio.load(String(body));

        //validate if application/rss+xml attribute is present in header
        if ($("head").find('link[type="application/rss+xml"]').length > 0) {
          var autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
            "href"
          );

          //validate if the url is valid
          if (isURL(autoDiscoverUrl)) {
            url = autoDiscoverUrl;
          } else {
            //find overlap and create new url
            var overlap = findOverlap(responseUrl, autoDiscoverUrl);
            url = responseUrl.replace(overlap, "") + autoDiscoverUrl;
          }
        }

        //validate if application/atom+xml attribute is present in header
        if ($("head").find('link[type="application/atom+xml"]').length > 0) {
          autoDiscoverUrl = $('head link[type="application/atom+xml"]').attr(
            "href"
          );

          //validate if the url is valid
          //sometimes the RSS url in the header points to a new or different URL than the processed URL itself
          if (isURL(autoDiscoverUrl)) {
            url = autoDiscoverUrl;
          } else {
            //find overlap and create new url
            var overlap = findOverlap(responseUrl, autoDiscoverUrl);
            url = responseUrl.replace(overlap, "") + autoDiscoverUrl;
          }
        }
      }
      //return final result set
      return url;
    }
  } catch (err) {
    console.log(err.message);
  }
}

export const discover = async (url) => {
  try {
    const autodiscover = await getUrl(url);
    return autodiscover;
  } catch (err) {
    console.log(err);
  }
};

export default {
  findOverlap,
  isURL,
  getUrl,
  discover
}