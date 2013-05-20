<?php

include 'config.php';
include 'functions.php';

//url with arg
$viewurl = $_SERVER['REQUEST_URI'];
$valurl = $_SERVER['REQUEST_URI'];
if (strpos($viewurl, 'view=list') == false) {
  $viewurl = str_replace("&view=detailed", "", $viewurl);
  $viewurl = str_replace("?view=detailed", "", $viewurl);
  if (strpos($viewurl, '?') !== false) {
    $viewurl = $viewurl . "&view=list";
  } else {
    $viewurl = $viewurl . "?view=list";
  }
}

//echo "<div class=\"list\">List view</div>";
//echo "<div class=\"detailed\">Detailed view</div>";

echo "<div class='topnav-button'>";
echo "<p><a href=\"$url/manage-feeds.php\">Manage feeds</a></p>";
echo "</div>";

echo "<div class='topnav-button'>";
echo "<p><a href=\"$url/update.php\">Update feeds</a></p>";
echo "</div>";

echo "<div class='topnav-button'>";
echo "<p><a href=\"$url/opml.php\">Import opml</a></p>";
echo "</div>";

echo "<div class='topnav-button home-topnav-button'>";
echo "<p><a href=\"$url/index.php\">Home</a></p>";
echo "</div>";

?>

<form method="post" action="addfeedhandler.php">
<input type="text" name="feedname" value="Add feed or url">
<input type="submit" value="submit" name="submit" class="button">
</form>

<?php

echo "<div class='second-bar'>";

echo "<div class=\"list\">List view</div>";
echo "<div class=\"detailed\">Detailed view</div>";

echo "</div>";

?>
