
import { parseFeed } from 'feedsmith'
import { fetchURL } from "./discoverRssLink.js";

export const process = async (feedUrl) => {
  try {
    const response = await fetchURL(feedUrl);
    const body = await response.text();
    const feed = parseFeed(body);
    return JSON.stringify(feed, null, 2);
  } catch (err) {
    console.log(err);
  }
}

export default {
  process
}