FROM node:11.6-alpine

ADD ./client /usr/local/rssmonster/client
WORKDIR /usr/local/rssmonster/client
RUN npm install
RUN npm run build

ADD ./server /usr/local/rssmonster/server
WORKDIR /usr/local/rssmonster/server
RUN mv ../client/dist ./
RUN npm install

COPY ./server/.env.example /usr/local/rssmonster/server/.env
EXPOSE 3000/tcp
CMD npm run start
