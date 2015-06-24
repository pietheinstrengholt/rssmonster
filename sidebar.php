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
echo "<button class='btn btn-small btn-success mark-all-as-read' type='button'>Mark all as read</button>";
echo "<a href=\"manage-feeds.php\" role=\"button\" class=\"btn btn-small btn-primary organize-feeds\">Organize Feeds</a>";
echo "</div>";

//Show status menu (unread, read, starred items). The count for each category added by the rssmonster javascript when loading article items
echo "<div class=\"panel\" id=\"status\">";
echo "<a href=\"#\" class=\"list-group-item active\"><b>Status menu items</b></a>";

echo "<a href=\"#\" id=\"unread\" class=\"list-group-item\">";
echo "<span class=\"unread badge\"></span>";
echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-sunglasses\"></span><span id=\"title-name\">unread</span></span>";
echo "</a>";

echo "<a href=\"#\" id=\"read\" class=\"list-group-item\">";
echo "<span class=\"read badge\"></span>";
echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-pencil\"></span><span id=\"title-name\">read</span></span>";
echo "</a>";

echo "<a href=\"#\" id=\"starred\" class=\"list-group-item\">";
echo "<span class=\"starred badge\"></span>";
echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-star\"></span><span id=\"title-name\">starred</span></span>";
echo "</a>";

echo "</div>";

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
			$query = "{\"jsonrpc\": \"2.0\", \"request\": \"feeds-per-category-id\", \"value\": \"$category_id\"}";
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

if (empty($categories)) {
	echo "<p style=\"margin-left:3px;\">No categories found, use the top menu to add new RSS feeds!<p>";
}


?>
