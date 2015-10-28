RSS Monster
=======

Copyright (c) 2015 Piethein Strengholt, piethein@strengholt-online.nl

RSSMonster is an easy to use and open source rss reader, created as an alternative for Google Reader.
RSSMonster features a lightweight fluid responsive design. It uses the twitter boostrap framework, laravel 
lumen and is in written in jQuery, JavaScript and PHP. Several features are implemented such as 
marking as read when scrolling, manage feeds, json events, etc.
RSSMonster is currently a work in progress and is hosted on GitHub. 
Feel free to add any contributions or new features.

<img src="http://www.strengholt-online.nl/wp-content/uploads/2015/rssmonster.png" width="700px">

REQUIREMENTS
------------

* PHP >= 5.5.9
* OpenSSL PHP Extension
* Mbstring PHP Extension
* Tokenizer PHP Extension
* Composer
* Git

INSTALLATION
------------

1. Install composer: curl -sS https://getcomposer.org/installer | php — –filename=composer
2. Download lumen: composer global require "laravel/lumen-installer=~1.0"
3. Clone the RSSMonster repository: git clone https://github.com/pietheinstrengholt/rssmonster.git
4. Inside the rssmonster directory run: composer update
5. Copy the .env.example to .env and configure with the correct database settings
6. Deploy the database, use the following command: php artisan migrate:refresh --seed
7. Navigate to http://yourRSSMonsterurl/index.php and add feeds by using the top menu
8. Add a cron job to pull articles: curl -s http://yourRSSMonsterurl/index.php/api/feed/updateall

Reeder (iOS) integration supprt (via Fever API)
----

Reeder (iOS) support has been added recently. To use Reeder add an Account with Fever (feedafever.com). Point to the following url:

http://yourRSSMonsterurl/fever-api.php

Any username and password will work at this moment.

<img src="http://phppaper.strengholt-online.nl/wp-content/uploads/fever.png" width="300px">


WISHLIST
----

* When moving feeds between categories, change the count for the category
* Restore Reeder support (via Fever API)
* Add Feedbin Api support
* Add composer requirements bootstrap, jquery, jquery-ui
* Mark as read, unread buttons
* Add search function
* Welcome screen when database is empty
* Lazy load images for detailed view
* Add spinner while loading
* Fix https://github.com/LaravelCollective/html/issues/41

CREDITS
-------

The following scripts and plug-ins are used within RSSMonster

* Laravel Lumen https://github.com/laravel/lumen
* Twitter bootstrap: https://twitter.github.io/bootstrap/
* SimplePie: http://simplepie.org/
* jQuery: http://jquery.com/
* jQuery Waypoint: https://github.com/imakewebthings/jquery-waypoints/
* Infinite scrolling: http://www.inserthtml.com/2013/01/scroll-pagination/
