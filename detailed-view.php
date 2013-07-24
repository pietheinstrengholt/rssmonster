<?php

//include
include 'config.php';
include 'functions.php';

if(isset($_POST['sort'])){ $sort = htmlspecialchars($_POST['sort']); } else { $sort = NULL; }
if(isset($_POST['articlelist'])){ $articlelist = htmlspecialchars($_POST['articlelist']); } else { $articlelist = NULL; }

$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "sort": "' . $_POST['sort'] . '", "article_id": "' . $_POST['articlelist'] . '"}');

if (!empty($array) && $array != "no-results") {
   foreach ($array as $row) {

    echo "<div id=block class=$offset>";

    if (!empty($row)) {

                echo "<div class='article' id=$row[id]>";

		if ($row['star_ind'] == '1') {
	                echo "<img class='item-star star $offset' id=$row[id] src='images/star_selected.png'>";
		} else {
                        echo "<img class='item-star unstar $offset' id=$row[id] src='images/star_unselected.png'>";
		}

                echo "<h3 class='heading' id=$row[id]><a href=\"$row[url]\" target=\"_blank\">$row[subject]</a></h3>";
		if (!empty($row[author])) {
                	echo "<div class='feedname'>$row[feed_name] by $row[author] | $row[publish_date]</div>";
		} else {
                        echo "<div class='feedname'>$row[feed_name] | $row[publish_date]</div>";
		}
                echo "<hr>";
                echo "<div class='page-content'>$row[content]</div>";
                echo "</div>";

    }
  echo "</div>";
  }
}

?>
