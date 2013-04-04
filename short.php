<?php

//retrieve feed or category information from input argument
if(isset($_GET['feeds'])) { 
  $input_feed = htmlspecialchars($_GET["feeds"]);
  $input_feed = urldecode($input_feed);
}
if(isset($_GET['categories'])) { 
  $input_category = htmlspecialchars($_GET["categories"]);
  $input_category = urldecode($input_category);
}

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "offset":"0", "postnumbers":"100", "input_category": "' . $input_category . '","input_feed": "' . $input_feed . '"}');

if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {

    echo "<div id=block-short>";

    if (!empty($row)) {

                echo "<div class='article-short' id=$row[id]>";

		if(isset($_GET['categories'])) {
                  echo "<h3 id=$row[id]><a href=\"$url/index.php?categories=$input_category&article_id=$row[id]\">$row[subject]</a></h3>";
		} elseif(isset($_GET['feeds'])) {
                  echo "<h3 id=$row[id]><a href=\"$url/index.php?feeds=$input_feed&article_id=$row[id]\">$row[subject]</a></h3>";
		} else {
		  echo "<h3 id=$row[id]><a href=\"$url/index.php?article_id=$row[id]\">$row[subject]</a></h3>";
		}

                echo "<div class='feedname-short'>$row[feed_name] | $row[publish_date]</div>";

                echo "<hr></div>";
    }
    echo "</div>";
  }
}

?>

