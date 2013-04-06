<html>
<head>
    <link rel="stylesheet" href="stylesheets/styles.css">
    <link rel="stylesheet" href="stylesheets/pygment_trac.css">
</head>
<body>
<top-nav>
<?php
include 'top-nav.php';
?>
</top-nav>

<br><br>

<?php

#require_once('../simplepie.inc');
require_once('simplepie/autoloader.php');

include 'config.php';

$query = "select * from feeds";
$sql   = mysql_query($query);

?>

<table border='1'>
<tr>
 <th>ID</th>
 <th>Feed_Name</th>
 <th>Last_date</th>
 <th>Publish_date</th>
 <th>Result</th>
</tr>

<?php

while ($row = mysql_fetch_array($sql)) {
    
    $feed      = $row['url'];
    $feed_id   = $row['id'];
    $feed_name = $row['name'];
    
    //echo $feed;
    
    $feed = new SimplePie($feed);
    $feed->init();
    $feed->handle_content_type();
    
    $lastdate    = mysql_query("SELECT publish_date from articles WHERE feed_id = '$feed_id;' ORDER BY publish_date desc LIMIT 1");
    $comparedate = mysql_result($lastdate, 0);
    
    //echo "<br><br>";
    
?>

<?php
    
    mysql_query("UPDATE feeds set last_update = CURRENT_TIMESTAMP where id = '$feed_id'") or die(mysql_error());
    
    
    //default to 1900 if no results exist
    if (empty($comparedate)) {
        $comparedate = "1900-01-01 00:00:00";
    }
    
    foreach ($feed->get_items() as $item) {
        
        $url     = $item->get_permalink();
        $subject = $item->get_title();
        $content = $item->get_description();
        //$content = mysql_real_escape_string($content);
        $date    = $item->get_date('Y-m-j H:i:s');
        
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
        if (strtotime($date) > strtotime($comparedate)) {
            echo "new article";
            mysql_query("INSERT INTO articles (feed_id, status, url, subject, content, insert_date, publish_date) VALUES('$feed_id', 'unread', '$url', '" . mysql_real_escape_string($subject) . "', '" . 
mysql_real_escape_string($content) . "', CURRENT_TIMESTAMP, '$date')") or die(mysql_error());
            
            
            //                        mysql_query("INSERT INTO feeds (last_update) VALUES(CURRENT_TIMESTAMP)")
            //                        or die(mysql_error());
            
            
        } else {
            echo "existing";
        }
?>
 </th>
</tr>

<?php
        
    }
}

echo "</table>";

?>

<head>
        <title>Update page</title>
</head>

</body>
</html>
