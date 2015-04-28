<?php

//includes
include 'config.php';
include 'functions.php';

if(isset($_POST['sort'])){ $sort = htmlspecialchars($_POST['sort']); } else { $sort = NULL; }
if(isset($_POST['articlelist'])){ $articlelist = htmlspecialchars($_POST['articlelist']); } else { $articlelist = NULL; }

$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "sort": "' . $_POST['sort'] . '", "article_id": "' . $_POST['articlelist'] . '"}');

if (!empty($array) && $array != "no-results") {
    foreach ($array as $row) {

		echo "<div id=\"block\">";

			if (!empty($row)) {

				echo "<div class='article' id=$row[id]>";

				if ($row['star_ind'] == '1') {
					echo "<div class='item-star star' id=$row[id]></div>";
				} else {
					echo "<div class='item-star unstar' id=$row[id]></div>";
				}

				$subject = $row['subject'];

				echo "<h4 class='heading' id=$row[id]><a href=\"$row[url]\" target=\"_blank\">$subject</a></h4>";

				if (!empty($row['author'])) {
					$feedtitle = $row['feed_name'] . " by " . $row['author'];
				} else {
					$feedtitle = $row['feed_name'];
				}

				echo "<div class='feedname'>$feedtitle | $row[publish_date]</div>";

				echo "<div class='minimal' id=$row[id]>";
				echo "<span class=\"feedname\">$row[feed_name]</span>";
				echo "<span class=\"heading\"><a href=\"$row[url]\" target=\"_blank\"> - $subject</a></span>";

				$datetime1 = date_create('now');
				$datetime2 = date_create($row['publish_date']);
				$interval = date_diff($datetime1, $datetime2);

				$difference =  format_interval($interval);

				echo "<span class=\"publishdate\">$difference</span>";

				echo "</div>";

				echo "<hr>";
				//show complete content block
				echo "<div class='page-content'>$row[content]</div>";
				//show less content block with no urls and only up to 250 characters
				echo "<div class='less-content'>";
				$lesscontent = strip_tags($row['content']);
				$lesscontent = preg_replace('/\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|$!:,.;]*[A-Z0-9+&@#\/%=~_|$]/i', '', $lesscontent);
				$lesscontent = substr($lesscontent, 0, 250);
				echo $lesscontent;
				echo "</div>";

				echo "</div>";

			}
		echo "</div>";
	}
}

?>
