FROM php:7.1-fpm

RUN apt-get update && apt-get install -y libmcrypt-dev curl git wget gnupg zip unzip \
    mysql-client libmagickwand-dev --no-install-recommends \
    && pecl install imagick \
    && docker-php-ext-enable imagick \
    && docker-php-ext-install mcrypt pdo_mysql

RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get install -y nodejs

RUN php -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
RUN php composer-setup.php --install-dir=/usr/bin --filename=composer
RUN php -r "unlink('composer-setup.php');"

ADD . /var/www/
WORKDIR /var/www/
RUN composer install -d /var/www/ --no-interaction --optimize-autoloader
RUN npm i -g npm@5.1.0
RUN npm install --save-dev
RUN npm run production