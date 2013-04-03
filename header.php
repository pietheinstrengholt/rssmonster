<?php

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "count-all"}');

?>

<div class='category-overview'>
 <div class='category-main'>
  <span>Overview</span>
 </div>
 <div class='category-all'>
  <a href="<?php echo $url; ?>/index.php"><span>All</span></a>
  <span class='category-count'>
  <?php echo $array[0][count]; ?>
  </span>
 </div>
</div>

<div class='category-section'>
 <div class='category-main'>
  <span>Categories</span>
 </div>

<?php

$array = get_json('{"jsonrpc": "2.0", "request": "overview-categories"}');

if (!empty($array)) {
  foreach ($array as $row) {
    if (!empty($row)) {

		$category = $row['category'];

                ?>
		<div class='category'>
                <span class='category-name'>
		<a href="<?php echo $url; ?>/index.php?category=<?php echo $category; ?>">
                <?php echo $category; ?>
		</a>
                </span>
                <span class='category-count'>
		<?php echo $row['count']; ?>
                </span>
		</div> 
		<?
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

		$feed = $row['name'];

		?>
                <div class='feed'>
                <span class='feed-name'>
		<a href="<?php echo $url; ?>/index.php?feed=<?php echo $feed; ?>">
		<?php 
		echo $feed; 
		?>
                </a>
                </span>
                <span class='feed-count'>
		<?php echo $row['count']; ?>
                </span>
                </div>
		<?php
    }
  }
}

echo "</div>";

?>
