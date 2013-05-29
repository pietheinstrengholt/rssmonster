<a href="http://www.phppaper.com">
  <img src="http://www.phppaper.com/wp-content/uploads/phppaper2.png" width="600px">
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
4. Manual add feeds or import OPML
5. Point to http://yourselfossurl.com/update.php

CREDITS
-------

The following scripts are used within phppaper

* SimplePie: http://simplepie.org/
* jQuery: http://jquery.com/
* jQuery UI: http://jqueryui.com
* jQuery Bullseye: http://static.pixeltango.com/jQuery/Bullseye/
* Infinite scrolling: http://www.inserthtml.com/2013/01/scroll-pagination/
* Twitter bootstrap: http://twitter.github.io/bootstrap/
* jQuery Cookie: https://github.com/carhartl/jquery-cookie


TODO
----

* Desktop: finish design
* General: Complete JSON events: add feeds, update event
* General: Clean up by creating more functions or using a proper framework
* Android redirect to mobile, make it possible to return to desktop/normale view
* Desktop mode: mark as read, unread
* Desktop mode: dynamic changing count
