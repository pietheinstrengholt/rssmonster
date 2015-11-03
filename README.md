RSS Monster
=======

Copyright (c) 2015 Piethein Strengholt, piethein@strengholt-online.nl

RSSMonster is an easy to use web-based RSS aggregator and reader compatible with the Fever API, created as an alternative for Google Reader.
RSSMonster features a lightweight fluid responsive design. It is written in JavaScript and PHP and uses the Laravel 
lumen and twitter boostrap framework. Several features are implemented such as 
marking as read when scrolling, drag and drop style manage feeds, json events, etc.
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
4. Inside the RSSMonster directory run: composer update
5. Copy the .env.example to .env and configure with the correct database settings
6. Deploy the database, use the following command: php artisan migrate:refresh --seed
7. Navigate to http://yourRSSMonsterurl/index.php and add feeds by using the top menu
8. Add a cron job to pull articles: curl -s http://yourRSSMonsterurl/index.php/api/feed/updateall

Reeder (iOS) integration supprt (via Fever API)
----

Reeder (iOS) support is added. To use the Reeder API (http://feedafever.com/api), point to the following url:

http://yourRSSMonsterurl/public/index.php/api/fever

Any username and password will work.
You might need to change the redirect in the .htaccess inside the public folder. 
Change "/lumen/public/" to the location where RSSMonster has been deployed.

<img src="http://phppaper.strengholt-online.nl/wp-content/uploads/fever.png" width="300px">


WISHLIST
----

* Cosmetic: When moving feeds between categories, change the count for the category
* Mark as read, unread buttons
* Add search function
* Welcome screen when database is empty
* Lazy load images for detailed view

CREDITS
-------

The following scripts and plug-ins are used within RSSMonster

* Laravel Lumen https://github.com/laravel/lumen
* Twitter bootstrap: https://twitter.github.io/bootstrap/
* SimplePie: http://simplepie.org/
* jQuery: http://jquery.com/
* jQuery Waypoint: https://github.com/imakewebthings/jquery-waypoints/
* Infinite scrolling: http://www.inserthtml.com/2013/01/scroll-pagination/
