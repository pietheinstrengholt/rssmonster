<?php

include 'config.php';
include 'functions.php';

echo "<div class=\"nav-main\">";

function header_section($input, $name) {
  if (!empty($input)) {
  
    $displayname = ucfirst($name);
    echo "<ul class='feedbar'>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row[category], 0, 16);

        echo "<li class='main' id='$title'>";
        echo "<div class=\"pointer\"></div>";
	echo "<div class=\"title\">$title</div>";
	echo "<div class=\"count\">";
        echo "<span class=\"count\">$row[count_all]</span>";
	echo "<span class=\"count\"> / </span>";
        echo "<span class=\"count\">$row[count_unread]</span>";
	echo "</div>";
        echo "</li>";

        echo "<ul>";

	$result = mysql_query("SELECT name, id, favicon FROM feeds WHERE category = '$row[category]'");

	while ($row = mysql_fetch_array($result, MYSQL_NUM)) {
		echo "<li class=\"sub\"><span class=\"favicon\"><img class=\"favicon\" src=\"$row[2]\"></img></span><span class=\"title\">$row[0]</span></li>";

	}

	mysql_free_result($result);

        echo "</ul>";

      }
    }
    echo "</ul>";
  }
}

$array = get_json('{"jsonrpc": "2.0", "overview": "category-detailed"}');
header_section($array,'category');

echo "</div>";

?>
