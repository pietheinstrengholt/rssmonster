<head>

<script type="text/javascript">

jQuery(document).ready(function() {
  jQuery("div.change-view").click(function() {

      //change detailed view to list view
      $('section').load('list-view.php');
      window.location.hash = 'listview';

  });
});

</script>

</head>

<?php

include 'config.php';
include 'functions.php';

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
echo "<p>List view<p>";
echo "</div>";

echo "<div class='topnav-button home-topnav-button'>";
echo "<p><a href=\"$url/index.php\">Home</a><p>";
echo "</div>";

?>

<form method="post" action="addfeedhandler.php">
<input type="text" name="feedname" value="Add feed or url">
<input type="submit" value="submit" name="submit" class="button">
</form>

