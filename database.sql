--
-- Database: `openreader`
--

-- --------------------------------------------------------

--
-- Table structure for table `articles`
--

DROP TABLE IF EXISTS `articles`;
CREATE TABLE IF NOT EXISTS `articles` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `feed_id` mediumint(9) DEFAULT NULL,
  `status` varchar(10) DEFAULT NULL,
  `url` varchar(400) DEFAULT NULL,
  `subject` varchar(400) DEFAULT NULL,
  `content` text,
  `insert_date` datetime DEFAULT NULL,
  `publish_date` datetime DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1 AUTO_INCREMENT=1 ;

-- --------------------------------------------------------

--
-- Table structure for table `feeds`
--

DROP TABLE IF EXISTS `feeds`;
CREATE TABLE IF NOT EXISTS `feeds` (
  `id` mediumint(9) NOT NULL AUTO_INCREMENT,
  `name` varchar(200) NOT NULL,
  `name_desc` varchar(2000) DEFAULT NULL,
  `url` varchar(200) NOT NULL,
  `category` varchar(200) DEFAULT NULL,
  `last_update` date DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1 AUTO_INCREMENT=1 ;


