<head>
 <script src="javascripts/jquery-1.9.1.min.js"></script>
 <link rel="stylesheet" href="stylesheets/styles.css">
</head>

<br><br>
<?php

/**
 * opmlhandler.php
 *
 * The opmlhandler.php parses the XML OPML file
 * and imports all the feeds into the database
 *
 */

include 'config.php';
include 'functions.php';
include 'database.class.php';
require_once('simplepie/autoloader.php');

if ($_FILES["file"]["error"] > 0) {
	echo "Error: " . $_FILES["file"]["error"] . "<br>";
} else {

	//check if file is uploaded
	if (!array_key_exists('file', $_FILES)) {
		throw new Exception("No file uploaded!");
	}

	//check for xml
	$opml = $_FILES['file'];
	if (!$opml['type'] == 'text/xml') {
		throw new Exception("Unsupported file type!: " . $opml['type']);
	}

	$subs = $opml['tmp_name'];
	$subs = simplexml_load_file($opml['tmp_name']);
	$subs = $subs->body;

	function addSubscription($xml, $tags) {

		// OPML Required attributes: text,xmlUrl,type
		// Optional attributes: title, htmlUrl, language, title, version
		if ($xml['type'] != 'rss' && $xml['type'] != 'atom') {
			$title = (string) $xml['text'];
			echo "RSS type not supported for: $title<br>";
		} else {

			// description
			$title = (string) $xml['text'];

			// RSS URL
			$data['url'] = (string) $xml['xmlUrl'];

			//check if feed_name already exists in database
			$database->query("SELECT count(*) as count FROM t_feeds WHERE feed_name = :name");
			$database->bind(':name', $title);
			$row = $database->single();
			$count = $row['count'];

			if ($count > 0) {
				echo "SKIPPED: $title<br>";
			} else {
				echo "ADDED: $title $data[url] <br>";

				//Get favoicon for each rss feed
				if(isset($_POST['favoicon'])) { 
					$getfavoicon = htmlspecialchars($_POST['favoicon']); 
				} else { 
					$getfavoicon = NULL; 
					$favicon = NULL; 
				}

				//get favoicon
				if($getfavoicon == 'Yes') {
					$feed = new SimplePie($data[url]);
					$feed->init();
					$feed->handle_content_type();
					$favicon = $feed->get_favicon();
				}
			  
				$database->beginTransaction();
				$database->query("INSERT INTO t_feeds (feed_name, url, favicon) VALUES (:feed_name, :url, :favicon)");
				$database->bind(':feed_name', $title);
				$database->bind(':url', $data['url']);
				$database->bind(':favicon', $favicon);
				$database->execute();
				$database->endTransaction();
			}
		}
	}

function processGroup($xml, $tags = Array()) {
	$errors = Array();

	// tags are the words of the outline parent
	if ((string) $xml['title'] && $xml['title'] != '/') {
		$tags[] = (string) $xml['title'];
	}

	foreach ($xml->outline as $outline) {
		if ((string) $outline['type']) {
			$ret = addSubscription($outline, $tags);
			if ($ret !== true) {
				$errors[] = $ret;
			}
		}

		if ($outline['type'] == 'folder') {
			//folder type, no functionality yet!
			echo "Folder type:<br>";
		} else {
			$ret = processGroup($outline, $tags);
			//$errors = array_merge($errors, $ret);
		}
	}
}

//process xml feed
processGroup($subs);

}

?>
