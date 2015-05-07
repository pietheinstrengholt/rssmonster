<?php

/**
 * sidebar.php
 *
 * The sidebar.php file is used for navigation
 * on the left side of the page. Only displayed on
 * large screens, not on small devices.
 *
 */

include 'config.php';
include 'functions.php';

echo "<div class=\"organize\">";
echo "<button class='btn btn-small btn-success' type='button'>Mark all as read</button>";
echo "<button class='btn btn-small btn-primary' type='button'>Organize Feeds</button>";
echo "</div>";

// Get overview of Article status
$status = get_json('{"jsonrpc": "2.0", "overview": "status"}');

//show status menu (unread, read, starred, etc. items)
if (!empty($status)) {

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
}

// Get overview of all categories and call function to feed sidebar
$categories = get_json('{"jsonrpc": "2.0", "overview": "category-detailed"}');

if (!empty($categories)) {

	echo "<div class=\"panel\" id=\"categories\">";
	echo "<a href=\"#\" class=\"list-group-item active\"><b>Categories items</b></a>";

	foreach ($categories as $category) {
		if (!empty($category)) {

			$category_id = $category['id'];

			echo "<a href=\"#\" id=\"$category_id\" class=\"list-group-item main\">";
			echo "<span class=\"badge\">";

			echo "<span class=\"countunread\">$category[count_unread]</span>";
			echo "<span class=\"countdivider\"> / </span>";
			echo "<span class=\"countall\">$category[count_all]</span>";

			echo "</span>";
			echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-chevron-right\"></span><span id=\"title-name\">" . substr($category['category_name'], 0, 16) . "</span></span>";
			echo "</a>";

			// Get count-per-category using json
			$query = "{\"jsonrpc\": \"2.0\", \"request\": \"count-per-category\", \"value\": \"$category_id\"}";
			$feeds = get_json($query);

			if (!empty($feeds)) {
			
				echo "<div class=\"menu-sub\" id='$category_id'>";
			
				foreach($feeds as $feed) {

					if (empty($feed['count'])) {
						$feed['count'] = "0";
					}
					
					$feed_id = $feed['id'];

					//set favicon url
					if (empty($feed['favicon'])) {
						$faviconurl = "img/rss-default.gif";
					} else {
						$faviconurl = $feed['favicon'];
					}

					//show feed details
					echo "<a href=\"#\" id=\"$feed_id\" class=\"list-group-item sub\">";
					echo "<span class=\"badge\">$feed[count]</span>";
					echo "<span class=\"favicon\"><img class=\"favicon\" src=\"$faviconurl\"></img></span>";
					echo "<span class=\"title\">$feed[feed_name]</span>";
					echo "</a>";
				}
				
				echo "</div>";
			}

		}
	}

	echo "</div>";
}


?>
