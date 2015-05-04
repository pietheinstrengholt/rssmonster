<?php

include 'config.php';
include 'functions.php';

echo "<div class=\"organize\">";
echo "<button class='btn btn-small btn-warning' type='button'>Mark all as read</button>";
echo "<button class='btn btn-small btn-primary' type='button'>Organize Feeds</button>";
echo "</div>";

// Get overview of Article status
$status = get_json('{"jsonrpc": "2.0", "overview": "status"}');

echo "<div class=\"panel\" id=\"status\">";
echo "<a href=\"#\" class=\"list-group-item active\"><b>Status menu items</b></a>";

if (!empty($status)) {
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
}

echo "</div>";

// Get overview of all categories
echo "<div class=\"panel\" id=\"categories\">";

echo "<a href=\"#\" class=\"list-group-item\"><b>Categories items</b></a>";

function fn_header_section($input, $name) {

	global $conn;

	if (!empty($input)) {

		$displayname = ucfirst($name);

		foreach ($input as $row) {
			if (!empty($row)) {

				$category_id = $row['id'];
				$title = substr($row['category_name'], 0, 16);

				echo "<a href=\"#\" id=\"$category_id\" class=\"list-group-item main\">";
				echo "<span class=\"badge\">";

				echo "<span class=\"countunread\">$row[count_unread]</span>";
				echo "<span class=\"countdivider\"> / </span>";
				echo "<span class=\"countall\">$row[count_all]</span>";

				echo "</span>";
				echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-chevron-right\"></span><span id=\"title-name\">$title</span></span>";
				echo "</a>";

				echo "<div class=\"menu-sub\" id='$category_id'>";

				// Get count-per-category using json
				$category = $row['category_name'];
				$query = "{\"jsonrpc\": \"2.0\", \"request\": \"count-per-category\", \"value\": \"$category\"}";
				$rows = get_json($query);

				if (!empty($rows)) {
					foreach($rows as $row) {

						if (empty($row['count'])) {
							$row['count'] = "0";
						}
						
						$feed_id = $row['id'];

						if (empty($row['favicon'])) {
							$faviconurl = "img/rss-default.gif";
						} else {
							$faviconurl = $row['favicon'];
						}

						echo "<a href=\"#\" id=\"$feed_id\" class=\"list-group-item sub\">";
						echo "<span class=\"badge\">$row[count]</span>";
						echo "<span class=\"favicon\"><img class=\"favicon\" src=\"$faviconurl\"></img></span>";
						echo "<span class=\"title\">$row[feed_name]</span>";
						echo "</a>";
					}
				}

				echo "</div>";

			}
		}
	}
}

// Get overview of all categories and call function to feed feedbar
$array = get_json('{"jsonrpc": "2.0", "overview": "category-detailed"}');

if (!empty($array)) {
	fn_header_section($array,'category');
}

echo "</div>";

?>
