<?php

include 'config.php';
include 'functions.php';

//url with arg
$viewurl = $_SERVER['REQUEST_URI'];
if (strpos($viewurl, 'view=') == false) {
  if (strpos($viewurl, '?') !== false) {
    $viewurl = $viewurl . "&view=list";
  } else {
    $viewurl = $viewurl . "?view=list";
  }
}

echo "<div class='topnav-button'>";
echo "<p><a href=\"$url/manage-feeds.php\">Manage feeds</a><p>";
echo "</div>";

echo "<div class='topnav-button'>";
echo "<p><a href=\"$url/update.php\">Update feeds</a><p>";
echo "</div>";

echo "<div class='topnav-button'>";
echo "<p><a href=\"$url/opml.php\">Import opml</a><p>";
echo "</div>";

echo "<div class='topnav-button change-view'>";
echo "<p><a href=\"$viewurl\">List view</a><p>";
echo "</div>";

echo "<div class='topnav-button home-topnav-button'>";
echo "<p><a href=\"$url/index.php\">Home</a><p>";
echo "</div>";

?>

<form method="post" action="addfeedhandler.php">
<input type="text" name="feedname" value="Add feed or url">
<input type="submit" value="submit" name="submit" class="button">
</form>

