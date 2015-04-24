<?php

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
$database->query("DELETE FROM articles WHERE id NOT IN (select * from (SELECT id FROM `articles` WHERE star_ind <>  '1' AND STATUS =  'read' ORDER BY insert_date desc LIMIT 0 , 2500) a UNION select * from (SELECT id FROM `articles`  WHERE star_ind =  '1') b UNION select * from (SELECT id FROM  `articles` WHERE status =  'unread') c)");
$database->execute();
$database->endTransaction();

//delete articles with no ref to feed_id
$database->beginTransaction();
$database->query("DELETE FROM `articles` WHERE feed_id not in (select distinct id from feeds)");
$database->execute();
$database->endTransaction();

//update 25 feeds at a time
$database->query("SELECT * FROM feeds ORDER BY last_update LIMIT 0, 50");
$rows = $database->resultset();

if (!empty($rows)) {

	//previous week
	$previousweek = date('Y-m-j H:i:s', strtotime('-7 days'));

	echo "<table id=\"update\" class=\"table table-bordered table-condensed\">";
	echo "<tr>";
	echo "<th>ID</th>";
	echo "<th>Feed_Name</th>";
	echo "<th>Last_date</th>";
	echo "<th>Publish_date</th>";
	echo "<th>Result</th>";
	echo "</tr>";

	foreach($rows as $row) {

		$feed_url  = $row['url'];
		$feed_id   = $row['id'];
		$feed_name = $row['name'];

		//init feed simplepie
		$feed = new SimplePie();
		$feed->set_feed_url($feed_url);
		$feed->set_cache_location($db_path);
		$feed->init();
		$feed->handle_content_type();

		$database->query("SELECT publish_date from articles WHERE feed_id = '$feed_id;' ORDER BY publish_date desc LIMIT 1");
		$publish_date = $database->single();
		$comparedate = $publish_date['publish_date'];

		//update feed with last_update date
		$database->beginTransaction();
		$database->query("UPDATE feeds SET last_update = CURRENT_TIMESTAMP where id = '$feed_id'");
		$database->execute();
		$database->endTransaction();

		//default to 1900 if no results exist
		if (empty($comparedate)) {
			$comparedate = "1900-01-01 00:00:00";
		}

		$itemQty = $feed->get_item_quantity();

		if ($itemQty === 0) {

			echo "<div class=\"alert alert-danger\">";
			echo "<button type=\"button\" class=\"close\" data-dismiss=\"alert\">&times;</button>";
			echo "<strong>Error! </strong>Unable to process feed: " . $feed_name . " Server might be down or url has changed.";
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

				echo "<tr><th>" . $feed_id . "</th><th>" . $feed_name . "</th><th>" . $comparedate . "</th><th>" . $date . "</th><th>";

				//publish date is later then compare date which assumes article is new
				if (strtotime($date) > strtotime($comparedate)) {

					$database->query("SELECT COUNT(*) as count FROM articles WHERE url = :url AND feed_id = :feed_id");
					$database->bind(':url', $url);
					$database->bind(':feed_id', $feed_id);
					$resulturl = $database->single();

					$database->query("SELECT COUNT(*) as count FROM articles WHERE subject = :subject AND feed_id = :feed_id");
					$database->bind(':subject', $subject);
					$database->bind(':feed_id', $feed_id);
					$resultsubject = $database->single();

				if (strtotime($date) < strtotime($previousweek)) {
					echo "Article more than one week old";
				} elseif ($resulturl['count'] == 0 && $resultsubject['count'] == 0) {
					echo "Found new article";
					$database->beginTransaction();
					$database->query("INSERT INTO articles (feed_id, status, url, subject, content, insert_date, publish_date, author) VALUES('$feed_id', 'unread', '$url', :subject, :content, CURRENT_TIMESTAMP, '$date', '$author')");
					$database->bind(':subject', $subject);
					$database->bind(':content', $content);
					$database->execute();
					$database->endTransaction();
				} else {
					echo "Skipping - Avoid duplicate url in db";
				}

				} else {
					echo "No new feeds since last update";
				}

				echo "</th></tr>";

			}
		}
	}
	echo "</table>";
}

//show amount of duplicates found
$database->query("SELECT count(*) as count FROM (SELECT MAX(id) as id FROM articles GROUP BY feed_id, url, subject HAVING COUNT(*) > 1 ORDER BY feed_id, url, subject) AS A");
$duplicates = $database->single();
echo "Removed " . $duplicates['count'] . " duplicates";

//clean-up duplicates
$database->beginTransaction();
$database->query("DELETE FROM articles WHERE id IN (SELECT * FROM (SELECT MAX(id) as id FROM articles GROUP BY feed_id, url, subject HAVING COUNT(*) > 1 ORDER BY feed_id, url, subject) AS A)");
$database->execute();
$database->endTransaction();

?>
