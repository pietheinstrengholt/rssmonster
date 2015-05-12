<?php

/**
 * opml.php
 *
 * The opml.php file is used to import
 * opml files.
 *
 */

echo "<result>";

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

include 'config.php';
include 'database.class.php';
include 'functions.php';
include 'header.php';

if(!empty($_POST)) {
	if ($_FILES["file"]["error"] > 0) {
		echo "Error: " . $_FILES["file"]["error"] . "<br>";
	} else {

		//load simplepie
		require_once('simplepie/autoloader.php');

		//check if file is uploaded
		if (!array_key_exists('file', $_FILES)) {
			throw new Exception("No file uploaded!");
			exit();
		}
		
		//check for xml file type
		if ($_FILES['file']['type'] != 'text/xml') {
			throw new Exception("Unsupported file type!: " . $_FILES['file']['type']);
			exit();
		}

		//simplexml load file
		$subs = simplexml_load_file($_FILES['file']['tmp_name']);
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
	exit();
}

?>

<div class="opml-form">
<legend>Import OPML file</legend>
<p>Use the browse button below to upload your OPML XML file.</p>
<br>
<small>Coming from Google Reader? Use Google Reader export to get your Google Reader subscriptions into a .xml file.</small>
<br><br>
<form action="<?php echo $_SERVER["PHP_SELF"]; ?>" method="post" enctype="multipart/form-data" id="usrform">
<fieldset>


<label>Select CSV file to upload</label>
<input class="btn btn-default" type="file" name="file" id="file"><br>
<br>
<input type="submit" name="submit" class="btn btn-primary"/>
</fieldset>
<p><br>Parsing all URLs for favoicons will cost performance. Please select the checkbox below to download favoicons for all URLs</p>
<label style="margin-left: 20px;" class="checkbox">
<input type="checkbox" name="favoicon" value="Yes"> Download favo icons
</label>
</form>

</div>
</results>