<?php

include 'config.php';
include 'functions.php';

//echo "<div class=\"organize\"><a href=\"$url/manage-feeds.php\">Organize Feeds</a></div>";

echo "<div class=\"organize\">";
echo "<button class='btn btn-small btn-primary' type='button'>Organize Feeds</button>";
echo "</div>";

echo "<div class=\"nav-main\">";

function header_section($input, $name) {
  if (!empty($input)) {
  
    $displayname = ucfirst($name);
    echo "<div class='feedbar'>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row[category], 0, 16);

	echo "<div class=\"menu-heading\" id='$title'>";
          echo "<div class=\"pointer\"></div>";
	  echo "<div class=\"title\">$title</div>";
	  echo "<div class=\"count\">";
          echo "<span class=\"count\">$row[count_all]</span>";
	  echo "<span class=\"count\"> / </span>";
          echo "<span class=\"count\">$row[count_unread]</span>";
	  echo "</div>";
	echo "</div>";

	$result = mysql_query("SELECT name, id, favicon FROM feeds WHERE category = '$row[category]'");

	echo "<div class=\"menu-sub\" id='$title'>";

	while ($row = mysql_fetch_array($result, MYSQL_NUM)) {
		echo "<div class=\"menu-sub-item\"><span class=\"favicon\"><img class=\"favicon\" src=\"$row[2]\"></img></span><span class=\"title\">$row[0]</span></div>";

	}

	mysql_free_result($result);

        echo "</div>";

      }
    }
    echo "</div>";
  }
}

$array = get_json('{"jsonrpc": "2.0", "overview": "category-detailed"}');
header_section($array,'category');

echo "</div>";

?>
