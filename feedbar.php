<?php

include 'config.php';
include 'functions.php';

echo "<div class=\"organize\">";
echo "<button class='btn btn-small btn-warning' type='button'>Mark all as read</button>";
echo "<button class='btn btn-small btn-primary' type='button'>Organize Feeds</button>";
echo "</div>";

// Get overview of Article status
$status = get_json('{"jsonrpc": "2.0", "overview": "status"}');

//echo "<pre>";
//print_r($status);
//echo "</pre>";

echo "<div class=\"panel\" id=\"status\">";
echo "<a href=\"#\" class=\"list-group-item active\"><b>Status menu items</b></a>";

foreach ($status as $row) {

	if (!empty($row)) {
		$cssid = str_replace(" ", "-", $row['name']);
		echo "<a href=\"#\" id=\"$cssid\" class=\"list-group-item\">";
		echo "<span class=\"badge\">$row[count]</span>";	
		
		if ($cssid == 'unread') {
			echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-search\"></span><span id=\"title-name\">$row[name]</span></span>";
		} elseif ($cssid == 'read') {
			echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-pencil\"></span><span id=\"title-name\">$row[name]</span></span>";
		} elseif ($cssid == 'starred') {
			echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-star\"></span><span id=\"title-name\">$row[name]</span></span>";
		} elseif ($cssid == 'last-24-hours') {
			echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-tint\"></span><span id=\"title-name\">$row[name]</span></span>";
		} elseif ($cssid == 'last-hour') {
			echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-leaf\"></span><span id=\"title-name\">$row[name]</span></span>";
		}
		
		echo "</a>";
	}
}

echo "</div>";

// Get overview of all categories
echo "<div class=\"panel\" id=\"categories\">";

echo "<a href=\"#\" class=\"list-group-item\"><b>Categories items</b></a>";

function header_section($input, $name) {

	global $conn;

	if (!empty($input)) {
  
		$displayname = ucfirst($name);

		foreach ($input as $row) {
			if (!empty($row)) {

				$title = substr($row['category'], 0, 16);
				$csstitle = preg_replace("/[^A-Za-z0-9 ]/", '', $title);
				$csstitle = preg_replace('/\s+/', '',$csstitle);

				echo "<a href=\"#\" id=\"$csstitle\" class=\"list-group-item main\">";
				echo "<span class=\"badge\">";
				
				echo "<span class=\"countunread\">$row[count_unread]</span>";
				echo "<span class=\"countdivider\"> / </span>";
				echo "<span class=\"countall\">$row[count_all]</span>";
				
				echo "</span>";				
				echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-chevron-right\"></span><span id=\"title-name\">$title</span></span>";
				echo "</a>";

				echo "<div class=\"menu-sub\" id='$title'>";

				foreach($conn->query("SELECT name, id, favicon, count FROM (select * from feeds WHERE category IN (SELECT DISTINCT id FROM category WHERE name = '$row[category]')) a left join (SELECT count(*) as count, feed_id from articles WHERE status = 'unread' group by feed_id) b on a.id = b.feed_id") as $row) {

					if (empty($row[3])) {
						$row[3] = "0";
					}

					$csssubtitle = preg_replace("/[^A-Za-z0-9 ]/", '', $row[0]);
					$csssubtitle = preg_replace('/\s+/', '',$csssubtitle);

					if (empty($row[2])) {
						$faviconurl = "img/rss-default.gif";
					} else {
						$faviconurl = $row[2];
					}
					
					echo "<a href=\"#\" id=\"$csssubtitle\" class=\"list-group-item sub\">";
					echo "<span class=\"badge\">$row[3]</span>";
					echo "<span class=\"favicon\"><img class=\"favicon\" src=\"$faviconurl\"></img></span>";
					echo "<span class=\"title\">$row[0]</span>";
					echo "</a>";

				}

				echo "</div>";

			}
		}
	}
}

// Get overview of all categories and call function to feed feedbar
$array = get_json('{"jsonrpc": "2.0", "overview": "category-detailed"}');
header_section($array,'category');

echo "</div>";

?>
