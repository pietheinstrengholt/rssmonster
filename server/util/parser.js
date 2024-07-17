import Parser from 'rss-parser';

export const process = async (feedUrl) => {
  let parser = new Parser();
  try {
    let response = await parser.parseURL(feedUrl);
    return response;
  } catch (err) {
    console.log(err);
  }
}

export default {
  process
}