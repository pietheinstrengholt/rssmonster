<?php

/**
 * addfeedhandler.php
 *
 * The addfeedhandler.php file is responsible for
 * adding new rss feeds to the database. 
 * Feeds will be validated. Existing ones and
 * incorrect ones will be skipped.
 *
 */

echo "<result>";

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

require_once('simplepie/autoloader.php');

include 'config.php';
include 'database.class.php';
include 'functions.php';
include 'header.php';

//initialize database
$database = new Database();

if (isset($_POST['feedname'])) {
	$feedname = htmlspecialchars($_POST['feedname']);
} else {
	$feedname = NULL;
}
echo "Trying to add new feed: " . "<b>" . $feedname . "</b>";

$feed = new SimplePie();
$feed->set_feed_url($feedname);
$feed->set_cache_location(CACHE_DIR);
$feed->init();
$feed->handle_content_type();

//if error found, show error message and stop parsing
if ($feed->error()) {

	echo "<strong>Error! </strong>Unable to process feed: " . $feedname . "<br><br>";		
	echo $feed->error();
	
} else {

	$title = $feed->get_title();
	$feed_desc = $feed->get_description();
	$feedurl = $feed->get_permalink();
	//favicon has been deprecated: $feed->get_favicon();
	$favicon = NULL;

	echo "<p><br>" . $feedurl . "<br>" . $title . "<br>" . $feed_desc . "<br></p>";

	if (empty($title)) {
		echo "<strong><br>Title is empty, rss feed seems to be invalid!</strong>";
		exit();
	}

	//check if feed_name already exists in database
	$database->query("SELECT feed_name FROM t_feeds WHERE feed_name = :feed_name OR url = :url");
	$database->bind(':feed_name', $title);
	$database->bind(':url', $feedname);
	$rows = $database->resultset();

	if (!empty($rows)) {
		echo "<strong><br>Error adding \"$title\", feed with same title or with same url already exists!</strong>";
		exit();
	}

	//TODO: replace with json
	$database->beginTransaction();
	$database->query("INSERT INTO t_feeds (feed_name, feed_desc, url, favicon) VALUES (:title, :feed_desc, :url, :favicon)");
	$database->bind(':title', $title);
	$database->bind(':feed_desc', $feed_desc);
	$database->bind(':url', $feedname);
	$database->bind(':favicon', $favicon);
	$database->execute();
	$database->endTransaction();

	echo "<<strong>><br><br>Feedname \"$title\" added to list with rss feeds!</strong>";

}

echo "</result>";

?>
