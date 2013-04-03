<?php

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "count-all"}');

echo "<div class='category-overview'>";

echo "<div class='category-main'>";
echo "<span>Overview</span>";
echo "</div>";

echo "<div class='category-all'>";
echo "<a href=\"$url";
echo "/index.php\">";
echo "<span>All</span>";
echo "</a>";
echo "<span class='category-count'>";
echo $array[0][count];
echo "</span>";

echo "</div>";

echo "</div>";

?>

<?php

echo "<div class='category-section'>";

echo "<div class='category-main'>";
echo "<span>Categories</span>";
echo "</div>";

$array = get_json('{"jsonrpc": "2.0", "request": "overview-categories"}');

if (!empty($array)) {
  foreach ($array as $row) {
    if (!empty($row)) {

		echo "<div class='category'>";
                echo "<span class='category-name'>";
		$category = $row['category'];
		echo "<a href=\"$url";
		echo "/index.php?category=$category\">";
                echo $category;
		echo "</a>";
                echo "</span>";
                echo "<span class='category-count'>";
		echo $row['count'];
                echo "</span>";
		echo "</div>";
    }
  }
}

echo "</div>";

echo "<div class='feed-section'>";

echo "<div class='feed-main'>";
echo "<span>Feeds</span>";
echo "</div>";

$array = get_json('{"jsonrpc": "2.0", "request": "overview-feeds"}');

if (!empty($array)) {
  foreach ($array as $row) {
    if (!empty($row)) {

                echo "<div class='feed'>";
                echo "<span class='feed-name'>";
                $feed = $row['name'];
                echo "<a href=\"$url";
                echo "/index.php?feed=$feed\">";
                echo $feed;
                echo "</a>";
                echo "</span>";
                echo "<span class='feed-count'>";
                echo $row['count'];
                echo "</span>";
                echo "</div>";
    }
  }
}

echo "</div>";

?>
