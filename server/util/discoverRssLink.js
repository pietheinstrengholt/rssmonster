import { load } from 'cheerio';
// Use native fetch (Node.js 18+) for better HTTP/2 support

// Helper function for delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

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

export const fetchURL = async (url, retries = 2) => {
  const attemptFetch = async (attempt) => {
    // Use AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    const options = {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml,application/atom+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache"
      }
    };

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      
      // Retry on network errors
      const isRetryable = err.message && (
        err.message.includes('socket hang up') ||
        err.message.includes('ECONNRESET') ||
        err.message.includes('ETIMEDOUT') ||
        err.message.includes('fetch failed') ||
        err.name === 'AbortError'
      );
      
      if (isRetryable && attempt < retries) {
        const waitTime = 1000 * (attempt + 1); // Exponential backoff: 1s, 2s
        console.log(`Fetch attempt ${attempt + 1} failed for ${url}, retrying in ${waitTime}ms...`);
        await delay(waitTime);
        return attemptFetch(attempt + 1);
      }
      
      throw err;
    }
  };

  try {
    return await attemptFetch(0);

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
            //If rssLink is already an absolute URL, return it directly
            if (rssLink.startsWith('http://') || rssLink.startsWith('https://')) {
              return rssLink;
            }
            //find overlap and create new url for relative URLs
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