<result>
<?php 

require_once('simplepie/autoloader.php');
include 'config.php';
include 'functions.php';

$feed = $_GET["feedname"];
echo "Trying to add new feed: " . "<b>" . $feed . "</b>";

$feed = new SimplePie($feed);
$feed->init();
$feed->handle_content_type();

$title = $feed->get_title();
$desc = $feed->get_description();
$feedurl = $feed->get_permalink();
$favicon = $feed->get_favicon();

echo "<p><br>";
echo $feedurl;
echo "<br>";
echo $title;
echo "<br>";
echo $desc;
echo "<br>";
echo "</p>";

if (empty($title)) {
  echo "<br><br>Title is empty, rss feed might be invalid!<br>";
} else {

  //TODO: replace with json
  $sql=mysql_query("SELECT DISTINCT name FROM feeds ORDER BY name");
  while($r[]=mysql_fetch_array($sql));

  if (in_multiarray($title, $r)) {
    echo "<br><br>Error adding \"$title\", feedname already exists or rss is invalid!<br>";
  } else { 
    //TODO: replace with json
    $sql = "INSERT INTO feeds (name, name_desc, url, favicon) VALUES ('".mysql_real_escape_string($title)."','".mysql_real_escape_string($desc)."','".mysql_real_escape_string($feedurl)."','".mysql_real_escape_string($favicon)."')";
    mysql_query($sql);
    echo "<br><br><br>Feedname \"$title\" added to list with rss feeds!<br>";
  }
}
?>
</result>

