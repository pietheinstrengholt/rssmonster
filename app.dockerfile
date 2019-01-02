FROM node:11.6-alpine

RUN mkdir -p /usr/local/rssmonster/{client,server}

WORKDIR /usr/local/rssmonster/client
COPY ./client/package.json ./client/package-lock.json ./
RUN npm install

WORKDIR /usr/local/rssmonster/server
COPY ./server/package.json ./server/package-lock.json ./
RUN npm install

ADD ./client /usr/local/rssmonster/client
WORKDIR /usr/local/rssmonster/client
RUN npm run build
RUN mv ./dist ../server

ADD ./server /usr/local/rssmonster/server

WORKDIR /usr/local/rssmonster/server
COPY ./server/.env.example ./.env
EXPOSE 3000/tcp
CMD npm run start
