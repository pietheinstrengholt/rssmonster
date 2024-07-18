import { load } from 'cheerio';
import fetch from "node-fetch";
//import http and https, needed for setting the agents for node-fetch
import http from 'http';
import https from 'https';

http.globalAgent.maxSockets = 1000000;
https.globalAgent.maxSockets = 1000000;

//function to return overlap
const findOverlap = (a, b) => {
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

//function to validate if url is valid url
const isURL = (str) => {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#:.?+=&%!\-\/]))?/;
  if (!regex.test(str)) {
    return false;
  } else {
    return true;
  }
}

export const fetchURL = async (url) => {
  try {

    //set agents for http or https
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
    const response = fetch(url, options);
    return response;

  } catch (e) {
    console.log(
      "Error fetching RSS link for " + url + " " + e.message
    );
  }
}

export const discoverRssLink = async (url) => {
  try {
    //fetch url by using proper user agent
    const response = await fetchURL(url);

    if (response.ok) {

      //set body text, needed for cheerio for trying to retrieve rss link
      const body = await response.text();
      //return response url, in case the url has been changed
      const responseUrl = response.url;

      //This piece of code takes in the origin link of the site. 
      //It validates the body. And then it uses cheerio to see if at least one of two types of links to the RSS feed are found in the head of the page.
      if (body) {
        const $ = load(String(body));
        let rssLink = $('head link[type="application/rss+xml"]').attr("href") || $('head link[type="application/atom+xml"]').attr("href");
        //There was no link found in the head of the page.
        if (rssLink == undefined) {
          return url;
        } else {
          //There is a link, but it could be an invalid URL.
          if (isURL(rssLink)) {
            //find overlap and create new url
            var overlap = findOverlap(responseUrl, rssLink);
            url = responseUrl.replace(overlap, "") + rssLink;
            return url;
          } else {
            return url;
          }
        }
      }
    }
  } catch (e) {
    console.log(
      "Error discovering RSS link for " + url + " " + e.message
    );
  }
}

export default {
  fetchURL,
  discoverRssLink
}