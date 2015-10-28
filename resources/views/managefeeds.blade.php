<?php

// url variables
$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);

// Get overview of all feeds
$feeds = json_decode(file_get_contents($url . '/api/feed'), true);

// Get overview of all categories
$categories = json_decode(file_get_contents($url . '/api/category'), true);

if (!empty($feeds) && !empty($categories)) {

	echo "<form class=\"form-inline\">";
	echo "<div style=\"margin-top: 10px; margin-left:10px;\" class=\"table-responsive\">";
	echo "<table class=\"table table-hover table-bordered table-condensed\">";
	
	echo "<tr class=\"warning\">";
    echo "<th width=\"10%\">ID</th>";
	echo "<th width=\"45%\">Feed name</th>";
	echo "<th width=\"30%\">Category</th>";
	echo "<th width=\"15%\">Delete</th>";
	echo "</tr>";

	foreach ($feeds as $feed) {
		//set feed_id variable
		$feed_id = $feed['id'];

		echo "<input name=\"[$feed_id][feed_id]\" type=\"hidden\" value=\"$feed_id\"  />";

		echo "<tr>";
		
		echo "<td>";
		echo "<span>" . $feed['id'] . "</span>";
		echo "</td>";		
		
		echo "<td>";
		echo "<div style=\"width:100%\" class=\"form-group\">";
		echo "<input name=\"[$feed_id][feed_name]\" style=\"width:100%\" type=\"text\" class=\"form-control\" id=\"exampleInputName2\" value=\"$feed[feed_name]\" placeholder=\"$feed[feed_name]\">";
		echo "</div>";
		echo "</td>";
		
		echo "<td>";
		echo "<div style=\"width:100%\" class=\"form-group\">";
		echo "<select name=\"[$feed_id][category_id]\" style=\"width:100%\" class=\"form-control\">";
		foreach ($categories as $category) {
			if ($feed['category_id'] == $category['id']) {
				echo "<option selected=\"selected\" value=\"$category[id]\">$category[name]</option>";
			} else {
				echo "<option value=\"$category[id]\">$category[name]</option>";			
			}
		}
		echo "</select>";
		echo "</div>";
		echo "</td>";
		
		echo "<td>";
		echo "<div class=\"checkbox\">";
		echo "<label>";
		echo "<input name=\"[$feed_id][delete]\" type=\"checkbox\"> Delete";
		echo "</label>";
		echo "</div>";
		echo "</td>";
		
		echo "</tr>";

	}
	
	echo "</table>";
	echo "</div>";
	echo "</form>";
	
	echo "<button class=\"btn btn-primary\" id=\"submit-feedchanges\" name=\"formSubmit\" value=\"Submit\" type=\"submit\">Submit</button>";
	

	
}
if (empty($feeds)) {
	echo "No feeds are found, please use the top menu to submit a new RSS feed.";
}


?>