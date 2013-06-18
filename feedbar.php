<?php

include 'config.php';
include 'functions.php';

echo "<div class=\"organize\">";
echo "<button class='btn btn-small btn-warning' type='button'>Mark all as read</button>";
echo "<button class='btn btn-small btn-primary' type='button'>Organize Feeds</button>";
echo "</div>";

echo "<div class=\"nav-main\">";

// Get overview of Article status
echo "<li class=\"nav-header\">Articles</li>";
$status = get_json('{"jsonrpc": "2.0", "overview": "status"}');

foreach ($status as $row) {
      if (!empty($row)) {

        $cssid = str_replace(" ", "-", $row['name']);  
	echo "<div class=\"menu-heading-status\" id='$cssid'>";
	  echo "<div class=\"pointer\">";
	  if ($cssid == 'unread') {
	    echo "<i class=\"icon-search\"></i>";
	  } elseif ($cssid == 'read') {
            echo "<i class=\"icon-pencil\"></i>";
	  } elseif ($cssid == 'starred') {
            echo "<i class=\"icon-star-empty\"></i>";
          } elseif ($cssid == 'last-24-hours') {
            echo "<i class=\"icon-tint\"></i>";
          } elseif ($cssid == 'last-hour') {
            echo "<i class=\"icon-leaf\"></i>";
	  }

	  echo "</div>";
	    echo "<div class=\"title\">$row[name]</div>";
	    echo "<div class=\"count\">";
            echo "<span class=\"count\">$row[count]</span>";
	  echo "</div>";
	echo "</div>";

      }
    }


// Get overview of all categories
echo "<li class=\"nav-header\">Categories</li>";

function header_section($input, $name) {
  if (!empty($input)) {
  
    $displayname = ucfirst($name);
    echo "<div class='feedbar'>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row['category'], 0, 16);

	$csstitle = str_replace(" ", "-", $title);
	echo "<div class=\"menu-heading\" id='$csstitle'>";
	  echo "<div class=\"pointer-category\"><i class=\"icon-chevron-right\"></i></div>";
	  echo "<div class=\"title\">$title</div>";
	  echo "<div class=\"count\">";
          echo "<span class=\"count all\">$row[count_all]</span>";
	  echo "<span class=\"count\"> / </span>";
          echo "<span class=\"count unread\">$row[count_unread]</span>";
	  echo "</div>";
	echo "</div>";

        $result = mysql_query("SELECT name, id, favicon, count FROM (select * from feeds WHERE category = '$row[category]') a left join (SELECT count(*) as count, feed_id from articles WHERE status = 'unread' group by feed_id) b on a.id = b.feed_id");

	echo "<div class=\"menu-sub\" id='$title'>";

	while ($row = mysql_fetch_array($result, MYSQL_NUM)) {

		if (empty($row[3])) {
			$row[3] = "0";
		}

		$csssubtitle = str_replace(" ", "-", $row[0]);
		echo "<div class=\"menu-sub-item\" id=\"$csssubtitle\"><span class=\"favicon\"><img class=\"favicon\" src=\"$row[2]\"></img></span><span class=\"title\">$row[0]</span><span class=\"count-sub\">$row[3]</span></div>";

	}

	mysql_free_result($result);

        echo "</div>";

      }
    }
    echo "</div>";
  }
}

// Get overview of all categories and call function to feed feedbar
$array = get_json('{"jsonrpc": "2.0", "overview": "category-detailed"}');
header_section($array,'category');

echo "</div>";

?>
