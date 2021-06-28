const cheerio = require("cheerio");
const fetch = require("node-fetch");

function extractHostname(url) {
  var hostname;
  //find & remove protocol (http, ftp, etc.) and get hostname

  if (url.indexOf("//") > -1) {
    hostname = url.split("/")[2];
  } else {
    hostname = url.split("/")[0];
  }

  //find & remove port number
  hostname = hostname.split(":")[0];
  //find & remove "?"
  hostname = hostname.split("?")[0];

  return hostname;
}

// To address those who want the "root domain," use this function:
function extractRootDomain(url) {
  var domain = extractHostname(url),
    splitArr = domain.split("."),
    arrLen = splitArr.length;

  //extracting the root domain here
  //if there is a subdomain
  if (arrLen > 2) {
    domain = splitArr[arrLen - 2] + "." + splitArr[arrLen - 1];
    //check to see if it's using a Country Code Top Level Domain (ccTLD) (i.e. ".me.uk")
    if (splitArr[arrLen - 2].length == 2 && splitArr[arrLen - 1].length == 2) {
      //this is using a ccTLD
      domain = splitArr[arrLen - 3] + "." + domain;
    }
  }
  return domain;
}

//function to return overlap
function findOverlap(a, b) {
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
function isURL(str) {
  var regex = /(http|https):\/\/(\w+:{0,1}\w*)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%!\-\/]))?/;
  if (!regex.test(str)) {
    return false;
  } else {
    return true;
  }
}

async function getUrl(url) {
  try {
    //fetch url by using proper user agent
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_8_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/31.0.1650.63 Safari/537.36",
        Accept: "text/html,application/xhtml+xml"
      }
    });

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
          autoDiscoverUrl = $('head link[type="application/rss+xml"]').attr(
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
    } else {
      console.log("HTTP Error Response: " + response.status + " (" + response.statusText + ") - " + url);
    }
  } catch (err) {
    console.log("getUrl Error: " + err + " - " + url);
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
