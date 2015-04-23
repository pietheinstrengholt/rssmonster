<html>

<?php

#require_once('../simplepie.inc');
require_once('simplepie/autoloader.php');

include 'config.php';
include 'functions.php';

//limit to 2500 read articles history
$conn->query("DELETE FROM articles WHERE id NOT IN (select * from (SELECT id FROM `articles` WHERE star_ind <>  '1' AND STATUS =  'read' ORDER BY insert_date desc LIMIT 0 , 2500) a UNION select * from (SELECT id FROM `articles`  WHERE star_ind =  '1') b UNION select * from (SELECT id FROM  `articles` WHERE status =  'unread') c)");

//delete articles with no ref to feed_id
$conn->query("DELETE FROM `articles` WHERE feed_id not in (select distinct id from feeds)");

//update 25 feeds at a time
$sql = "select * from feeds order by last_update limit 0, 50";

//previous week
$previousweek = date('Y-m-j H:i:s', strtotime('-7 days'));

echo "<table id=\"update\" class=\"table table-bordered table-condensed\">";
echo "<tr>";
echo "<th>ID</th>";
echo "<th>Feed_Name</th>";
echo "<th>Last_date</th>";
echo "<th>Publish_date</th>";
echo "<th>Result</th>";
echo "</tr>";

foreach($conn->query($sql) as $row) {
    
    $feed_url  = $row['url'];
    $feed_id   = $row['id'];
    $feed_name = $row['name'];
    
    //init feed simplepie
    $feed = new SimplePie();
    $feed->set_feed_url($feed_url);
    $feed->set_cache_location($db_path);
    $feed->init();
    $feed->handle_content_type();
    
    $lastdate    = $conn->query("SELECT publish_date from articles WHERE feed_id = '$feed_id;' ORDER BY publish_date desc LIMIT 1");
    $fetch  = $lastdate->fetch();
    $comparedate = $fetch['publish_date'];
    
    $conn->query("UPDATE feeds set last_update = CURRENT_TIMESTAMP where id = '$feed_id'");  
    
    //default to 1900 if no results exist
    if (empty($comparedate)) {
        $comparedate = "1900-01-01 00:00:00";
    }

    $itemQty = $feed->get_item_quantity();

    if ($itemQty === 0) { 

	echo "<div class=\"alert alert-danger\">";
	echo "<button type=\"button\" class=\"close\" data-dismiss=\"alert\">&times;</button>";
	echo "<strong>Error! </strong>Unable to process feed: " . $feed_name . " Server might be down or url has changed.";
	echo "</div>";

    } else {

    foreach ($feed->get_items() as $item) {
        
        $url     = $item->get_permalink();
        $subject = $item->get_title();
        $content = $item->get_description();
        $date    = $item->get_date('Y-m-j H:i:s');

	if ($author = $feed->get_author())
	{
	   $author = $author->get_name();
	} else {
	   $author = "";
	}

	echo "<tr><th>" . $feed_id . "</th><th>" . $feed_name . "</th><th>" . $comparedate . "</th><th>" . $date . "</th><th>";

	//publish date is later then compare date which assumes article is new		
        if (strtotime($date) > strtotime($comparedate)) {

		$sth = $conn->query("SELECT COUNT(*) as count FROM articles WHERE url = :url AND feed_id = :feed_id");
                $sth->bindParam(':url', $url, PDO::PARAM_STR);
                $sth->bindParam(':feed_id', $feed_id, PDO::PARAM_STR);
                $sth->execute();
                $resulturl = $sth->fetch();
                $sth->closeCursor();

                $sth = $conn->query("SELECT COUNT(*) as count FROM articles WHERE subject = :subject AND feed_id = :feed_id");
                $sth->bindParam(':subject', $subject, PDO::PARAM_STR);
                $sth->bindParam(':feed_id', $feed_id, PDO::PARAM_STR);
                $sth->execute();
                $resultsubject = $sth->fetch();
                $sth->closeCursor();

		if (strtotime($date) < strtotime($previousweek)) {
                        echo "Article more than one week old";
                } elseif ($resulturl['count'] == 0 && $resultsubject['count'] == 0) {
                        echo "Found new article";
                        $sth = $conn->prepare("INSERT INTO articles (feed_id, status, url, subject, content, insert_date, publish_date, author) VALUES('$feed_id', 'unread', '$url', :subject, :content, CURRENT_TIMESTAMP, '$date', '$author')");
                        $sth->bindParam(':subject', $subject, PDO::PARAM_STR);
                        $sth->bindParam(':content', $content, PDO::PARAM_STR);
                        $sth->execute();
                } else {
                        echo "Skipping - Avoid duplicate url in db";
                }

        } else {
		echo "No new feeds since last update";
        }

	echo "</th></tr>";
        
    }
}

}

echo "</table>";

$dupplicates = $conn->query("SELECT count(*) as count FROM (SELECT MAX(id) as id FROM articles GROUP BY feed_id, url, subject HAVING COUNT(*) > 1 ORDER BY feed_id, url, subject) AS A");

$dupplicates  = $dupplicates->fetch();

echo "Removed " . $dupplicates['count'] . " dupplicates";

//cleanup dupplicates
$conn->query("DELETE FROM articles WHERE id IN (SELECT * FROM (SELECT MAX(id) as id FROM articles GROUP BY feed_id, url, subject HAVING COUNT(*) > 1 ORDER BY feed_id, url, subject) AS A)");

?>

</html>
