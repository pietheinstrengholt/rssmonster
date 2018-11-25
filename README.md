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
* Run `npm install` to install node dependencies, when using windows you might need to run `npm install --global --production windows-build-tools` first.
* Update the `resources/assets/js/config.js` and set the right path
* Run `npm run production` to compile all JS files
* Run `php artisan migrate` this will add all needed database tables to your mysql database
* Run `chmod -R 777 storage/`
The path may vary based on your configuration.
* Navigate to http://yourRSSMonsterurl/index.php and add feeds by using the top menu
* Add a cron job to pull articles: `curl -s http://yourRSSMonsterurl/api/feed/updateall`

#### Development
If you would like to run RSSMonster in development mode I recommand to run `npm run watch` and change the `mix.setResourceRoot('/');` location

#### Docker
* Clone this repository `git clone https://github.com/pietheinstrengholt/rssmonster.git .`
* Build and start all the images: `docker-compose up --build`
* Copy the environment configuration file: `cp .env.example .env`
* Install all composer dependencies: `docker-compose exec app composer update`
* Deploy the database: `docker-compose exec app php artisan migrate`
* Install all node dependencies: `docker-compose exec app npm install`
* Compile the JS files: `docker-compose exec app npm run production`
* Navigate to: `http://localhost:8080/`

#### Reeder (iOS) integration support (via Fever API)
Reeder (iOS) support have been added. To use the Reeder API (http://feedafever.com/api), point to the following url:

http://yourRSSMonsterurl/api/fever

Any username and password will work.
You might need to change the redirect in the `.htaccess` inside the public folder.
Change "/rssmonster/public/" to the location where RSSMonster has been deployed.

<img src="http://www.strengholt-online.nl/wp-content/uploads/2016/fever.png" width="300px">


#### Troubleshooting
If you come across a failure message like this one...

```
These dependencies were not found:
* /Users/you/Sites/folder/resources/assets/js/app.js
```
...then you're likely using npm 5.2 (npm -v). This version introduced a bug that caused installation errors for Mix. See for more info: https://github.com/JeffreyWay/laravel-mix/blob/master/docs/troubleshooting.md

#### Credits

The following scripts and plug-ins are used within RSSMonster

* Laravel Lumen https://github.com/laravel/lumen
* Twitter bootstrap: https://twitter.github.io/bootstrap/
* SimplePie: http://simplepie.org/
* VueJS: https://vuejs.org/
* Vue infinite scrolling: https://github.com/PeachScript/vue-infinite-loading
* Waypoints: https://github.com/imakewebthings/waypoints
