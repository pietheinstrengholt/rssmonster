## RSSMonster

[![Build Status](https://travis-ci.org/pietheinstrengholt/rssmonster.svg?branch=master)](https://travis-ci.org/pietheinstrengholt/rssmonster/)
[![License](https://img.shields.io/github/license/pietheinstrengholt/rssmonster.svg)](https://www.github.com/pietheinstrengholt/rssmonster/)

Copyright (c) 2019 Piethein Strengholt, piethein@strengholt-online.nl

RSSMonster is an easy to use web-based RSS aggregator, created as an alternative for Google Reader.
RSSMonster features a lightweight fluid responsive design. The font-end has been written in JavaScript (VueJS) and the back-end in Express (NodeJS). It also uses the Twitter Boostrap framework. Several features are implemented such as marking as read when scrolling, drag and drop style manage feeds, json events, etc. RSSMonster is compatible with the Fever API. Feel free to add any contributions or new features.

![Screenshot](client/src/assets/screenshots/screenshot01.png)

### Prerequisites
* NodeJS 10.x
* Git
* A Mysql installation (other databases will also work with a bit of configuration)

### How to get everything installed
* Clone this repository `git clone https://github.com/pietheinstrengholt/rssmonster.git .`
* Run `npm install` in both the `client` and `server` folder
* Find the `.env.example` file in the root of both the `client` and `server` folder. Copy and rename the files to `.env`
* Edit `.env` inside the `server` folder and enter your Mysql or Database server login data (at least fill DB_DATABASE, DB_USERNAME and DB_PASSWORD).
* Edit `.env` inside the `client` folder. Change the VUE_APP_HOSTNAME so it points to the back-end.
* Run `node_modules/.bin/sequelize init` this will add all needed database tables to your mysql database. Alternatively you can also uncomment the `//force:` true in the app.js inside the server folder.
* Run `node_modules/.bin/sequelize db:seed:all` to seed the database.
* Run `chmod -R 777 storage/`

### Development
If you would like to run RSSMonster in development mode I recommend to run:
- Inside the client folder: `npm run serve`.
- Inside the server folder: `npm run start`.

### Production
If you would like to run RSSMonster in production mode I recommend to run:
- Update the `VUE_APP_HOSTNAME` inside the file `client/.env`. Most likely you want to remove port 3000 and point to the url where the backend will be running.
- Inside the client folder build all the static files with: `npm run build`.
- Move the `dist` output folder created inside the `client` folder to the `server` folder. The NodeJS server is also capable of serving out static content.
- Inside the server folder: `npm run start`.

### Docker
- Run the following command to build all the images: `docker-compose build`
- Run the following command to start the containers: `docker-compose up`
- The client will be running on port 8080 and communication with the backend takes place via 3000. Make sure these ports aren't being used. The mysql database is accessible via port 3307.

### Reeder (iOS) integration support (via Fever API)
RSSMonster is compatible with the Fever API. Apps like Reeder (iOS) will support this. To use the Reeder API (http://feedafever.com/api), point to the following url:

http://yourRSSMonsterurl/api/fever

Any username and password will work.

![Screenshot Fever](client/src/assets/screenshots/fever.png)

#### Credits
The following scripts and plug-ins are used within RSSMonster

* NodeJS https://nodejs.org/en/
* Twitter bootstrap: https://twitter.github.io/bootstrap/
* Feedparser: https://github.com/danmactough/node-feedparser/
* VueJS: https://vuejs.org/
* Vue infinite scrolling: https://github.com/PeachScript/vue-infinite-loading
* Waypoints: https://github.com/imakewebthings/waypoints

#### TODO
- Change dist location when building VueJS to ../../server
- Implement settings (default category on initial load, ASC or DESC sort, etc.)