<?php

/**
 * update.php
 *
 * The update.php file is responsible for
 * parsing rss feeds and injecting the results 
 * in the database. If a article is more than
 * one week old it will be skipped. Existing 
 * articles are also skipped.
 *
 */

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

#require_once('../simplepie.inc');
require_once('simplepie/autoloader.php');

include 'config.php';
include 'database.class.php';
include 'functions.php';

//initialize database
$database = new Database();

//limit to 2500 read articles history
$database->beginTransaction();
$database->query("DELETE FROM t_articles WHERE id NOT IN (SELECT * FROM (SELECT id FROM t_articles WHERE star_ind <> '1' AND STATUS = 'read' ORDER BY insert_date DESC LIMIT 0 , 2500) a UNION SELECT * FROM (SELECT id FROM t_articles WHERE star_ind =  '1') b UNION SELECT * FROM (SELECT id FROM t_articles WHERE status = 'unread') c)");
$database->execute();
$database->endTransaction();

//delete articles with no ref to feed_id
$database->beginTransaction();
$database->query("DELETE FROM t_articles WHERE feed_id NOT IN (SELECT DISTINCT id FROM t_feeds)");
$database->execute();
$database->endTransaction();

//update 25 feeds at a time
$database->query("SELECT * FROM t_feeds ORDER BY last_update LIMIT 0, 50");
$rows = $database->resultset();

if (!empty($rows)) {

	//set previous week
	$previousweek = date('Y-m-j H:i:s', strtotime('-7 days'));

	echo "<table border=\"1\"  id=\"update\" class=\"table table-bordered table-condensed\">";
	echo "<tr>";
	echo "<th>ID</th>";
	echo "<th>Feed_Name</th>";
	echo "<th>Publish_date</th>";
	echo "<th>Result</th>";
	echo "</tr>";

	foreach($rows as $row) {

		//set feed variables
		$feed_url  = $row['url'];
		$feed_id   = $row['id'];
		$feed_name = $row['feed_name'];

		//init feed simplepie
		$feed = new SimplePie();
		$feed->set_feed_url($feed_url);
		$feed->set_cache_location(CACHE_DIR);

		//start simplepie
		$feed->init();
		$feed->handle_content_type();
		
		//if error found, show error message and stop parsing
		if ($feed->error()) {

			echo "<div class=\"alert alert-danger\">";
			echo "<button type=\"button\" class=\"close\" data-dismiss=\"alert\">&times;</button>";
			echo "<strong>Error! </strong>Unable to process feed: " . $feed_name . "<br>";		
			echo $feed->error();
			echo "</div>";
			
		} else {		

			foreach ($feed->get_items() as $item) {

				$url     = $item->get_permalink();
				$subject = $item->get_title();
				$content = $item->get_description();
				$date    = $item->get_date('Y-m-j H:i:s');

				if ($author = $feed->get_author()) {
					$author = $author->get_name();
				} else {
					$author = "";
				}

				echo "<tr><th>" . $feed_id . "</th><th>" . $feed_name . "</th><th>" . $date . "</th><th>";

				$database->query("SELECT * FROM t_articles WHERE (url = :url OR subject = :subject) AND feed_id = :feed_id");
				$database->bind(':url', $url);
				$database->bind(':subject', $subject);				
				$database->bind(':feed_id', $feed_id);
				$results = $database->resultset();
				
				//debug message if article is already present in database
				if (!empty($results)) {
					echo "Article already present in database";
				//debug message if article is more than one week old					
				} elseif (strtotime($date) < strtotime($previousweek)) {
					echo "Article more than one week old";
				//else add article
				} else {
					echo "New article found";
					$database->beginTransaction();
					$database->query("INSERT INTO t_articles (feed_id, status, url, subject, content, publish_date, author) VALUES (:feed_id, :status, :url, :subject, :content, :date, :author)");
					$database->bind(':feed_id', $feed_id);
					$database->bind(':status', 'unread');
					$database->bind(':url', $url);
					$database->bind(':subject', $subject);
					$database->bind(':content', $content);
					$database->bind(':date', $date);
					$database->bind(':author', $author);
					$database->execute();
					$database->endTransaction();					
				}		

				echo "</th></tr>";

			}
			
			//update feed's last_update date
			$database->beginTransaction();
			$database->query("UPDATE t_feeds SET last_update = CURRENT_TIMESTAMP WHERE id = :feed_id");
			$database->bind(':feed_id', $feed_id);			
			$database->execute();
			$database->endTransaction();			
			
		}
	}
	echo "</table>";
}

//show amount of duplicates found
$database->query("SELECT count(*) AS count FROM (SELECT MAX(id) AS id FROM t_articles GROUP BY feed_id, url, subject HAVING COUNT(*) > 1 ORDER BY feed_id, url, subject) AS A");
$duplicates = $database->single();
echo "Removed " . $duplicates['count'] . " duplicates";

//clean-up duplicates
$database->beginTransaction();
$database->query("DELETE FROM t_articles WHERE id IN (SELECT * FROM (SELECT MAX(id) AS id FROM t_articles GROUP BY feed_id, url, subject HAVING COUNT(*) > 1 ORDER BY feed_id, url, subject) AS A)");
$database->execute();
$database->endTransaction();

?>
