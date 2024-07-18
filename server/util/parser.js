import { parseFeed } from '@rowanmanning/feed-parser';
import { fetchURL } from "./discoverRssLink.js";

export const process = async (feedUrl) => {
  try {
    const response = await fetchURL(feedUrl);
    const body = await response.text();
    const feed = parseFeed(body).toJSON();
    return feed;
  } catch (err) {
    console.log(err);
  }
}

export default {
  process
}