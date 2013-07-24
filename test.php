<?php

include 'config.php';

$new = 'Appf';
$query = "SELECT id FROM category WHERE name = '$new'";
$count = mysql_query($query);

$numResults = mysql_num_rows($count);
if ($numResults > 0) {
   //category already exists in db
   echo "there are some results";
   $row = mysql_fetch_row($count);
   $newcategory = $row[0];
   $sql = "UPDATE feeds set name='$arr[new_feed_name]',category='$newcategory' WHERE id = $arr[value]";
   $result = mysql_query($sql);
   echo json_encode("done");
} else {
   //category does not exist
   echo $new;
   $sql = "INSERT INTO category (`id`, `name`) VALUES (NULL, '$new')";
   $result = mysql_query($sql);
   echo "<br>";
   //$test = printf(mysql_insert_id());
   //$queryid = "SELECT id FROM category WHERE name = '$new'";
   //$rownum = mysql_query($queryid);
   //$row = mysql_fetch_row($rownum);
   //$newcategory = $row[0];
   //echo $test;
   echo mysql_insert_id();
}

?>
