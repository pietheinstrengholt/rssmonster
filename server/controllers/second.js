const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");

var FeedParser = require("feedparser");
//var request = require("request"); // for fetching the feed
const cheerio = require('cheerio');
const fetch = require("node-fetch");

const url = "https://medium.com/-kjdf@taylorotwell";

const getData = async url => {
  try {
    const response = await fetch(url);
    const body = await response.text();
    const $ = cheerio.load(body);
    //console.log(body);
    var rssFeed = $('head link[type="application/rss+xml"]').attr("href");
    if (rssFeed) {
      return rssFeed;
    }
  } catch (error) {
    console.log(error);
  }
};

console.log(url);

//var zlib = require('zlib');
//var Iconv = require('iconv').Iconv;

//<link data-rh="true" id="feedLink" rel="alternate" type="application/rss+xml" title="RSS" href="https://medium.com/feed/@taylorotwell">

/* request('https://medium.com/@taylorotwell', function (error, response, body) {
  console.log('error:', error); // Print the error if one occurred
  console.log('statusCode:', response && response.statusCode); // Print the response status code if a response was received
  //console.log('body:', body); // Print the HTML for the Google homepage.
  //console.log(body);
  const $ = cheerio.load(body);
  /* var links = $("link");
  var anchors = [];
  links.each(function(i, link) {
      console.log("Anchor: " + $(link).attr("href"));
  });

  var RssFeed = $('head link[type="application/rss+xml"]').attr("href");
  console.log(RssFeed);

}); */