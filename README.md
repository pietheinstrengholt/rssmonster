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


TODO
----

* Desktop: finish design, functions in phppaper.js, dynamic count by using mark as read bullseye function
* General: Complete JSON events: add feeds, update event
* General: Clean up by creating more functions or using a proper framework
* Android redirect to mobile, make it possible to return to desktop/normale view
* Desktop mode: mark as read, unread
* Desktop mode: add search function
* Desktop mode: move js from list-view to phppaper.js
* Desktop mode: use classes for image-star properties
* Desktop mode: drag and dropstyle manage feeds section
* Desktop mode: sort asc and desc from menu
* Desktop mode: opml-handler, download icons. Functionality is currently disabled for performance reasons
* Desktop mode: first welcome screen to add opml or feed
* Desktop mode: retrieve rss feed from url, instead of adding direct link to rss
