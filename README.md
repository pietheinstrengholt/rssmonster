<a href="http://www.phppaper.com">
  <img src="http://www.phppaper.com/wp-content/uploads/phppaper2.png" width="700px">
</a>

phppaper
=======

Copyright (c) 2013 Piethein Strengholt, piethein@strengholt-online.nl
http://www.phppaper.com

Phppaper is an easy to use and open source rss reader, created as an alternatieve for Google Reader.
Phppaper features a lightweight fluid responsive design and in written in jquery, javascript and php.
It has adopted features such as opml import, marking as read when scrolling, manage feeds, json events, etc.
Phppaper is currently a work in progress and hosted on Github. Feel free to add any contributions or new features.

INSTALLATION
------------

1. Upload all files and unpack
2. Create a database, use the database.sql script
3. Configure the config.php by using the correct mysql database settings
4. Create a ./cache directory, make it writable (chmod 777)
5. Manual add feeds or import OPML
6. Point to http://yourphppaperurl/update.php

CREDITS
-------

The following scripts are used within phppaper

* SimplePie: http://simplepie.org/
* jQuery: http://jquery.com/
* jQuery Bullseye: http://static.pixeltango.com/jQuery/Bullseye/
* Infinite scrolling: http://www.inserthtml.com/2013/01/scroll-pagination/
* Twitter bootstrap: http://twitter.github.io/bootstrap/
* jQuery Cookie: https://github.com/carhartl/jquery-cookie

Reeder (iOS) integration supprt (via Fever API)
----

Reeder (iOS) support has been added recently. To use Reeder add an Account with Fever (feedafever.com). Point to the following url:

http://yourphppaperurl/fever-api.php

Any username and password will work at this moment.

<a href="http://www.phppaper.com">
  <img src="http://www.phppaper.com/wp-content/uploads/fever.png" width="300px">
</a>


TODO
----

* FIX last hour
* FIX manage feeds section
* Complete JSON events: add feeds, update event, mark as unread
* Clean up by creating more functions or using a proper framework
* Mark as read, unread buttons
* Add search function
* Move js from list-view to one central place (phppaper.js)
* Use css classes for image-star properties
* Implement drag and dropstyle to manage feeds
* First welcome screen to add opml or feeds
* Mark as read per category or per feed (Fever API)
* List view: continue loading 25 next read items
