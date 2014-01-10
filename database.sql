-- SQL Dump

SET SQL_MODE="NO_AUTO_VALUE_ON_ZERO";

--
-- Database: `phppaper`
--
CREATE DATABASE `phppaper` DEFAULT CHARACTER SET utf8 COLLATE utf8_general_ci;
USE `phppaper`;

-- --------------------------------------------------------

--
-- Table structure for table `articles`
--

CREATE TABLE IF NOT EXISTS `articles` (
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
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 AUTO_INCREMENT=1 ;

--
-- Dumping data for table `articles`
--


-- --------------------------------------------------------

--
-- Table structure for table `category`
--

CREATE TABLE IF NOT EXISTS `category` (
  `id` int(3) NOT NULL AUTO_INCREMENT,
  `name` varchar(600) CHARACTER SET utf8 NOT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 AUTO_INCREMENT=1 ;

--
-- Dumping data for table `category`
--


-- --------------------------------------------------------

--
-- Table structure for table `feeds`
--

CREATE TABLE IF NOT EXISTS `feeds` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) CHARACTER SET utf8 NOT NULL,
  `name_desc` varchar(2000) CHARACTER SET utf8 DEFAULT NULL,
  `url` varchar(200) CHARACTER SET utf8 NOT NULL,
  `category` varchar(200) CHARACTER SET utf8 NOT NULL DEFAULT '1',
  `favicon` varchar(200) CHARACTER SET utf8 DEFAULT NULL,
  `last_update` datetime DEFAULT NULL,
  `insert_date` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1 AUTO_INCREMENT=1 ;

--
-- Dumping data for table `feeds`
--


-- --------------------------------------------------------

--
-- Stand-in structure for view `id_status`
--
CREATE TABLE IF NOT EXISTS `id_status` (
`id` mediumint(9)
,`status` varchar(10)
,`feed` varchar(200)
,`category` varchar(600)
,`publish_date` varchar(13)
);
-- --------------------------------------------------------

--
-- Stand-in structure for view `overview_status`
--
CREATE TABLE IF NOT EXISTS `overview_status` (
`name` varchar(13)
,`count` bigint(21)
);
-- --------------------------------------------------------

--
-- Structure for view `id_status`
--
DROP TABLE IF EXISTS `id_status`;

CREATE ALGORITHM=UNDEFINED DEFINER=`phppaper`@`%` SQL SECURITY DEFINER VIEW `phppaper`.`id_status` AS select `t1`.`id` AS `id`,`t1`.`status` AS `status`,`t2`.`name` AS `feed`,`t3`.`name` AS `category`,(case when (`t1`.`publish_date` between (now() - interval 1 hour) and now()) then 'last-hour' when (`t1`.`publish_date` between (now() - interval 1 day) and now()) then 'last-24-hours' when (`t1`.`publish_date` between (now() - interval 1 week) and now()) then 'last-week' else 'other' end) AS `publish_date` from ((`phppaper`.`articles` `t1` left join `phppaper`.`feeds` `t2` on((`t1`.`feed_id` = `t2`.`id`))) left join `phppaper`.`category` `t3` on((`t2`.`category` = `t3`.`id`)));

-- --------------------------------------------------------

--
-- Structure for view `overview_status`
--
DROP TABLE IF EXISTS `overview_status`;

CREATE ALGORITHM=UNDEFINED DEFINER=`phppaper`@`%` SQL SECURITY DEFINER VIEW `phppaper`.`overview_status` AS select 'unread' AS `name`,count(0) AS `count` from `phppaper`.`articles` `a` where (`a`.`status` = 'unread') union select 'read' AS `name`,count(0) AS `count` from `phppaper`.`articles` `b` where (`b`.`status` = 'read') union select 'starred' AS `name`,count(0) AS `count` from `phppaper`.`articles` where (`phppaper`.`articles`.`star_ind` = '1') union select 'last 24 hours' AS `name`,count(0) AS `count` from `phppaper`.`articles` where ((`phppaper`.`articles`.`status` = 'unread') and (`phppaper`.`articles`.`publish_date` between (now() - interval 1 day) and now())) union select 'last hour' AS `name`,count(0) AS `count` from `phppaper`.`articles` where ((`phppaper`.`articles`.`status` = 'unread') and (`phppaper`.`articles`.`publish_date` between (now() - interval 1 hour) and now()));
