<result>
<?php 

require_once('simplepie/autoloader.php');
include 'config.php';
include 'functions.php';

if(isset($_GET['feedname'])){ $feedname = htmlspecialchars($_GET['feedname']); } else { $feedname = NULL; }
echo "Trying to add new feed: " . "<b>" . $feedname . "</b>";

$feed = new SimplePie();
$feed->set_feed_url($feedname);
//$feed->set_cache_location('/var/www/vhosts/strengholt-online.nl/httpdocs/phppaper/cache');
$feed->set_cache_location('./cache');
$feed->init();
$feed->handle_content_type();

$title = $feed->get_title();
$desc = $feed->get_description();
$feedurl = $feed->get_permalink();
//$favicon = $feed->get_favicon();
$favicon = NULL;

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
  $sql=$conn->query("SELECT DISTINCT name FROM feeds ORDER BY name");
  $r=$sql->fetchAll();

  if (in_array_r($title, $r)) {
    echo "<br><br>Error adding \"$title\", feedname already exists or rss is invalid!<br>";
  } else { 

    //TODO: replace with json
    $sql = "INSERT INTO feeds (name, name_desc, url, favicon) VALUES ('".mysql_real_escape_string($title)."','".mysql_real_escape_string($desc)."','".mysql_real_escape_string($feedurl)."','".mysql_real_escape_string($favicon)."')";
    $conn->query($sql);
    echo "<br><br><br>Feedname \"$title\" added to list with rss feeds!<br>";

  }
}
?>
</result>

