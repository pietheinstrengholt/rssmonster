SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8 */;

CREATE TABLE IF NOT EXISTS `t_articles` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `feed_id` mediumint(9) DEFAULT NULL,
  `status` varchar(10) CHARACTER SET utf8 DEFAULT NULL,
  `star_ind` int(1) NOT NULL DEFAULT '0',
  `url` varchar(400) CHARACTER SET utf8 DEFAULT NULL,
  `subject` varchar(400) CHARACTER SET utf8 DEFAULT NULL,
  `content` text CHARACTER SET utf8,
  `insert_date` datetime DEFAULT NULL,
  `publish_date` datetime DEFAULT NULL,
  `author` varchar(200) CHARACTER SET utf8 DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_2` (`id`),
  KEY `id` (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1 AUTO_INCREMENT=243602 ;

CREATE TABLE IF NOT EXISTS `t_categories` (
  `id` int(3) NOT NULL AUTO_INCREMENT,
  `category_name` varchar(600) CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_2` (`id`),
  KEY `id` (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1 AUTO_INCREMENT=79 ;

CREATE TABLE IF NOT EXISTS `t_feeds` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `feed_name` varchar(200) CHARACTER SET utf8 NOT NULL,
  `feed_desc` varchar(2000) CHARACTER SET utf8 DEFAULT NULL,
  `url` varchar(200) CHARACTER SET utf8 NOT NULL,
  `category_id` varchar(200) CHARACTER SET utf8 NOT NULL DEFAULT '1',
  `favicon` varchar(200) CHARACTER SET utf8 DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `insert_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `id_2` (`id`),
  KEY `id` (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1 AUTO_INCREMENT=12572 ;

CREATE TABLE IF NOT EXISTS `v_id_status` (
`id` mediumint(9)
,`status` varchar(10)
,`feed` varchar(200)
,`category` varchar(600)
,`publish_date` varchar(13)
);

CREATE TABLE IF NOT EXISTS `v_overview_status` (
`name` varchar(13)
,`count` bigint(21)
);DROP TABLE IF EXISTS `v_id_status`;

CREATE ALGORITHM=UNDEFINED DEFINER=`database`@`%` SQL SECURITY DEFINER VIEW `v_id_status` AS select `t1`.`id` AS `id`,`t1`.`status` AS `status`,`t2`.`feed_name` AS `feed`,`t3`.`category_name` AS `category`,(case when (`t1`.`publish_date` between (now() - interval 1 hour) and now()) then 'last-hour' when (`t1`.`publish_date` between (now() - interval 1 day) and now()) then 'last-24-hours' when (`t1`.`publish_date` between (now() - interval 1 week) and now()) then 'last-week' else 'other' end) AS `publish_date` from ((`t_articles` `t1` left join `t_feeds` `t2` on((`t1`.`feed_id` = `t2`.`id`))) left join `t_categories` `t3` on((`t2`.`category_id` = `t3`.`id`)));
DROP TABLE IF EXISTS `v_overview_status`;

CREATE ALGORITHM=UNDEFINED DEFINER=`database`@`%` SQL SECURITY DEFINER VIEW `v_overview_status` AS select 'unread' AS `name`,count(0) AS `count` from `t_articles` `a` where (`a`.`status` = 'unread') union select 'read' AS `name`,count(0) AS `count` from `t_articles` `b` where (`b`.`status` = 'read') union select 'starred' AS `name`,count(0) AS `count` from `t_articles` where (`t_articles`.`star_ind` = '1') union select 'last 24 hours' AS `name`,count(0) AS `count` from `t_articles` where ((`t_articles`.`status` = 'unread') and (`t_articles`.`publish_date` between (now() - interval 1 day) and now())) union select 'last hour' AS `name`,count(0) AS `count` from `t_articles` where ((`t_articles`.`status` = 'unread') and (`t_articles`.`publish_date` between (now() - interval 1 hour) and now()));

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
