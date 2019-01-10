FROM node:11.6-alpine

WORKDIR /app
COPY ./client/package.json ./client/package-lock.json ./
RUN npm install

ADD ./client /app/

EXPOSE 8080/tcp
CMD npm run serve
