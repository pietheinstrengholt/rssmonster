## RSS Monster

Copyright (c) 2017 Piethein Strengholt, piethein@strengholt-online.nl

RSSMonster is an easy to use web-based RSS aggregator and reader compatible with the Fever API, created as an alternative for Google Reader.
RSSMonster features a lightweight fluid responsive design. The font-end has been written in JavaScript (VueJS) and the back-end in PHP (Laravel Lumen). It also uses the Twitter Boostrap framework. Several features are implemented such as marking as read when scrolling, drag and drop style manage feeds, json events, etc. Feel free to add any contributions or new features.

![Screenshot](resources/assets/images/screenshots/screenshot01.png)

#### Prerequisites
* PHP >= 7.0
* OpenSSL PHP Extension
* Mbstring PHP Extension
* Tokenizer PHP Extension
* Git
* A mysql installation (other databases will also work with a bit of configuration)
* [Composer](https://getcomposer.org/)

#### How to get everything running
* Clone this repository `git clone https://github.com/pietheinstrengholt/rssmonster.git .`
* Find the `.env.example` file in the root of the project, copy it and rename to `.env`
* Edit `.env` and enter your mysql server login data (at least fill DB_DATABASE, DB_USERNAME and DB_PASSWORD)
* Start a command prompt and browse to the folder to which you checked out
* Run `composer install` this will install all dependencies and might take a while
* Run `php artisan key:generate` this will generate your individual application key, so that passwords are safe
* Run `npm install` to install node dependencies, when using windows you might need to run `npm install --global --production windows-build-tools` first.
* Update the `resources/assets/js/config.js` and set the right path
* Run `npm run production` to compile all JS files
* Run `php artisan migrate` this will add all needed database tables to your mysql database
* Run `chmod -R 777 storage/`
The path may vary based on your configuration.
* Navigate to http://yourRSSMonsterurl/index.php and add feeds by using the top menu
* Add a cron job to pull articles: `curl -s http://yourRSSMonsterurl/api/feed/updateall`

If you would like to run RSSMonster in development mode I recommand to run `npm run watch`

#### Reeder (iOS) integration support (via Fever API)

Reeder (iOS) support have been added. To use the Reeder API (http://feedafever.com/api), point to the following url:

http://yourRSSMonsterurl/api/fever

Any username and password will work.
You might need to change the redirect in the `.htaccess` inside the public folder.
Change "/lumen/public/" to the location where RSSMonster has been deployed.

<img src="http://www.strengholt-online.nl/wp-content/uploads/2016/fever.png" width="300px">

#### Credits

The following scripts and plug-ins are used within RSSMonster

* Laravel Lumen https://github.com/laravel/lumen
* Twitter bootstrap: https://twitter.github.io/bootstrap/
* SimplePie: http://simplepie.org/
* VueJS: https://vuejs.org/
* Vue infinite scrolling: https://github.com/PeachScript/vue-infinite-loading
* Waypoints: https://github.com/imakewebthings/waypoints
