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

?>

<table id="update" class="table table-bordered table-condensed">
<tr>
 <th>ID</th>
 <th>Feed_Name</th>
 <th>Last_date</th>
 <th>Publish_date</th>
 <th>Result</th>
</tr>

<?php

foreach($conn->query($sql) as $row) {
    
    $feed_url  = $row['url'];
    $feed_id   = $row['id'];
    $feed_name = $row['name'];
    
    //init feed simplepie
    $feed = new SimplePie();
    $feed->set_feed_url($feed_url);
    $feed->set_cache_location('./cache');
    $feed->init();
    $feed->handle_content_type();
    
    $lastdate    = $conn->query("SELECT publish_date from articles WHERE feed_id = '$feed_id;' ORDER BY publish_date desc LIMIT 1");
    $fetch  = $lastdate->fetch();
    $comparedate = $fetch['publish_date'];
	
    if (empty($comparedate)) { 

?>
<!-- <div class="alert"> -->
<!--  <button type="button" class="close" data-dismiss="alert">&times;</button> -->
<!--  <strong>Warning! </strong>No previous results found for feed: <?php echo $feed_name; ?>. Feed might be never processed or is invalid. -->
<!--</div> -->

<?php

}
    
?>

<?php
    
    $conn->query("UPDATE feeds set last_update = CURRENT_TIMESTAMP where id = '$feed_id'");  
    
    //default to 1900 if no results exist
    if (empty($comparedate)) {
        $comparedate = "1900-01-01 00:00:00";
    }

    $itemQty = $feed->get_item_quantity();

    if ($itemQty === 0) { 


?>
<div class="alert alert-danger">
  <button type="button" class="close" data-dismiss="alert">&times;</button>
  <strong>Error! </strong>Unable to process feed: <?php echo $feed_name; ?>. Server might be down or url has changed.
</div>

<?php


}

    else {

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
        
?>

<tr>
 <th><?php
        echo $feed_id;
?></th>
 <th><?php
        echo $feed_name;
?></th>
 <th><?php
        echo $comparedate;
?></th>
 <th><?php
        echo $date;
?></th>
 <th><?php

	//publish date is later then compare date which assumes article is new		
        if (strtotime($date) > strtotime($comparedate)) {

	    //check if article name does not already exist in db
	    $sth = $conn->prepare("SELECT COUNT(*) as count FROM articles WHERE subject = :subject AND feed_id = '$feed_id'");
	    $sth->bindParam(':subject', $subject, PDO::PARAM_STR);
	    $sth->execute();
	    $result = $sth->fetch();
	    $result = $result['count'];
	    $sth->closeCursor();
		$count  = $result;
		if ($count > 0) { 
			echo "Skipping - Avoid duplicate subjectname in db"; 
		} elseif (strtotime($date) < strtotime($previousweek)) {
			echo "Article more than one week old"; 
		} else {
			$sth = $conn->query("SELECT COUNT(*) as count FROM articles WHERE url = :url AND feed_id = :feed_id");
		        $sth->bindParam(':url', $url, PDO::PARAM_STR);
                        $sth->bindParam(':feed_id', $feed_id, PDO::PARAM_STR);
			$sth->execute();
			$resulturl = $sth->fetch();
			$sth->closeCursor();
			if ($resulturl) {
				$fetchcounturl  = $resulturl;
				$counturl = $fetchcounturl['count'];
			 	if ($counturl > 0) {
                        		echo "Skipping - Avoid duplicate url in db";
                		} else {
					echo "Found new article";
					$sth = $conn->prepare("INSERT INTO articles (feed_id, status, url, subject, content, insert_date, publish_date, author) VALUES('$feed_id', 'unread', '$url', :subject, :content, CURRENT_TIMESTAMP, '$date', '$author')");
					$sth->bindParam(':subject', $subject, PDO::PARAM_STR);
					$sth->bindParam(':content', $content, PDO::PARAM_STR);
					$sth->execute();
				}
			}
	    }

        } else {
            echo "No new feeds since last update";
        }
?>
 </th>
</tr>

<?php
        
    }
}

}

echo "</table>";

?>

</html>
