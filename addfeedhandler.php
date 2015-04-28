<?php

echo "<result>";

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

require_once('simplepie/autoloader.php');

include 'config.php';
include 'database.class.php';
include 'functions.php';

//initialize database
$database = new Database();

if (isset($_GET['feedname'])) {
	$feedname = htmlspecialchars($_GET['feedname']);
} else {
	$feedname = NULL;
}
echo "Trying to add new feed: " . "<b>" . $feedname . "</b>";

$feed = new SimplePie();
$feed->set_feed_url($feedname);
$feed->set_cache_location('./cache');
$feed->init();
$feed->handle_content_type();

$title = $feed->get_title();
$desc = $feed->get_description();
$feedurl = $feed->get_permalink();
//$favicon = $feed->get_favicon();
$favicon = NULL;

echo "<p><br>" . $feedurl . "<br>" . $title . "<br>" . $desc . "<br></p>";

if (empty($title)) {
	echo "<br><br>Title is empty, rss feed might be invalid!<br>";
} else {

	//TODO: replace with json
	$database->query("SELECT DISTINCT feed_name FROM t_feeds ORDER BY feed_name");
	$rows = $database->resultset();

	if (in_array_r($title, $rows)) {
		echo "<br><br>Error adding \"$title\", feedname already exists or rss is invalid!<br>";
	} else {

		//TODO: replace with json
		$title = mysql_escape_mimic($title);
		$desc = mysql_escape_mimic($desc);
		$feedurl = mysql_escape_mimic($feedurl);
		$favicon = mysql_escape_mimic($favicon);

		$database->beginTransaction();
		$database->query("INSERT INTO t_feeds (feed_name, feed_desc, url, favicon) VALUES (:title, :desc, :feedurl, :favicon)");
		$database->bind(':title', $title);
		$database->bind(':desc', $desc);
		$database->bind(':feedurl', $feedurl);
		$database->bind(':favicon', $favicon);
		$database->execute();
		$database->endTransaction();

		echo "<br><br><br>Feedname \"$title\" added to list with rss feeds!<br>";

	}
}

echo "</result>";

?>
