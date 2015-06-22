RSS Monster
=======

Copyright (c) 2015 Piethein Strengholt, piethein@strengholt-online.nl

RSSMonster is an easy to use and open source rss reader, created as an alternatieve for Google Reader.
RSSMonster features a lightweight fluid responsive design. It uses the twitter boostrap framework and 
is in written in jQuery, JavaScript and PHP. Several features are implemented such as opml import, 
marking as read when scrolling, manage feeds, json events, etc.
RSSMonster is currently a work in progress and is hosted on GitHub. 
Feel free to add any contributions or new features.

<img src="http://www.strengholt-online.nl/wp-content/uploads/2015/rssmonster.png" width="700px">

INSTALLATION
------------

1. Upload all files and unpack
2. Create a database, use the database.sql script
3. Configure the config.php by using the correct mysql database settings
4. Create a ./cache directory, make it writable (chmod 777)
5. Manual add feeds or import OPML
6. Point to http://yourRSSMonsterurl/update.php

Reeder (iOS) integration supprt (via Fever API)
----

Reeder (iOS) support has been added recently. To use Reeder add an Account with Fever (feedafever.com). Point to the following url:

http://yourRSSMonsterurl/fever-api.php

Any username and password will work at this moment.

<img src="http://phppaper.strengholt-online.nl/wp-content/uploads/fever.png" width="300px">


TODO
----

* Complete JSON events: add feeds, update event, mark as unread
* Clean up by creating more functions or using a proper framework
* Mark as read, unread buttons
* Add search function
* Implement drag and dropstyle to manage feeds
* First welcome screen when database is empty
* Lazy load images for detailed view

CREDITS
-------

The following scripts are used within RSSMonster

* SimplePie: http://simplepie.org/
* jQuery: http://jquery.com/
* jQuery Waypoint: https://github.com/imakewebthings/jquery-waypoints/
* Infinite scrolling: http://www.inserthtml.com/2013/01/scroll-pagination/
* Twitter bootstrap: http://twitter.github.io/bootstrap/
* jQuery Cookie: https://github.com/carhartl/jquery-cookie
