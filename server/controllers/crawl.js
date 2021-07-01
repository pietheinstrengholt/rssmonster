const Sequelize = require("sequelize");
const Op = Sequelize.Op;

const Feed = require("../models/feed");
const Article = require("../models/article");
const Hotlink = require("../models/hotlink");

const autodiscover = require("../util/autodiscover");
const parseFeed = require("../util/parser");
const language = require("../util/language");
const cheerio = require("cheerio");
const htmlparser2 = require('htmlparser2');

var striptags = require("striptags");

//put the try/catch block into a higher function and then put the async/await functions of that function
const catchAsync = fn => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

exports.getCrawl = catchAsync(async (req, res, next) => {
  try {
    //only get feeds with an errorCount lower than 25
    const feeds = await Feed.findAll({
      where: {
        active: true,
        errorCount: {
          [Op.lt]: 25
        }
      }
    });

    if (feeds.length > 0) {
      feeds.forEach(async function(feed) {
        //discover rssUrl
        const url = await autodiscover.discover(feed.url);

        //do not process undefined URLs
        if(typeof url !== "undefined") {
          try {
            const feeditem = await parseFeed.process(url);
            if (feeditem) {

              //process all feed posts
              feeditem.posts.forEach(function(post) {
                processArticle(feed, post);
              });
  
              //reset the feed count
              feed.update({
                errorCount: 0
              });
            }
          } catch (err) {
            console.log(err.stack.split("\n", 1).join("") + " - " + feed.url);
            //update the errorCount
            feed.update({
              errorCount: Sequelize.literal("errorCount + 1")
            });
          }
        } else {
          //update the errorCount
          feed.update({
            errorCount: Sequelize.literal("errorCount + 1")
          });
        }
      });
    }

    //destroy records older than two weeks
    Hotlink.destroy({
      where: {
        createdAt: {
          [Op.lte] : (new Date() -  14 * 24 * 60 * 60 * 1000)
        }
      }
    });

    return res.status(200).json("Crawling started.");
  } catch (err) {
    return next(err);
  }
});

async function processArticle(feed, post) {
  try {
    //try to find any existing article with the same link and post title
    const article = await Article.findOne({
      where: {
        [Op.or]: [
          {
            url: post.link
          },
          {
            subject: post.title
          }
        ],
        [Op.and]: {
          feedId: feed.id
        }
      }
    });

    //if none, add new article to the database
    if (!article) {
      //remove any script tags
      //dismiss "cheerio.load() expects a string" by converting to string

      //htmlparser2 has error-correcting mechanisms, which may be useful when parsing non-HTML content.
      const dom = htmlparser2.parseDocument(post.description);
      const $ = cheerio.load(dom, { _useHtmlParser2: true });

      //dismiss undefined errors
      if (typeof $ !== 'undefined') {
        $('script').remove();

        //execute hotlink feature by collecting all the links in each RSS post
        //https://github.com/passiomatic/coldsweat/issues/68#issuecomment-272963268
        $('a').each(function() {
          //find domain name for each link
          domain = (new URL(post.link));
          domain = domain.hostname;

          //fetch all urls referenced to other websites. Insert these into the hotlinks table
          if ($(this).attr('href')) {
            if (!$(this).attr('href').includes(domain)) {
              Hotlink.create({
                url: $(this).attr('href')
              });
            }
          }
        });

        //get all the links. The more frequently a link occurs, the more "hot" it is. 
        const hotlinks = await Hotlink.findAll({
          where: {
            url: post.link
          }
        });

        //parse media RSS feeds: https://www.rssboard.org/media-rss
        if (post['media:group']) {
          postLink = post['media:group']['media:content']['@']['url'];
          postTitle = post['media:group']['media:title']['#'];
          postContent = post['media:group']['media:description']['#'];
          postContentStripped = striptags(post['media:group']['media:description']['#']);
          postLanguage = language.get(post['media:group']['media:description']['#']);
        } else {
          postLink = post.link;
          postTitle = post.title;
          postContent = $.html();
          postContentStripped = striptags($.html(), ["a", "img", "strong"]);
          postLanguage = language.get($.html());
        }

        //add article
        Article.create({
          feedId: feed.id,
          status: "unread",
          star_ind: 0,
          hotlinks: hotlinks.length,
          url: postLink,
          image_url: "",
          subject: postTitle || 'No title',
          content: postContent,
          contentStripped: postContentStripped,
          language: postLanguage,
          //contentSnippet: item.contentSnippet,
          //author: item.author,
          //default post.pubdate with new Date when empty
          published: post.pubdate || new Date()
        });
      }
    }
  } catch (err) {
    console.log(err);
  }
}
