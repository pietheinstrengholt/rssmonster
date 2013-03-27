<?php

include 'config.php';

//receive number of posts to receive
$offset = is_numeric($_POST['offset']) ? $_POST['offset'] : die();
$postnumbers = is_numeric($_POST['number']) ? $_POST['number'] : die();

//query data
$query = "SELECT * FROM articles WHERE status = 'unread' ORDER BY publish_date DESC LIMIT $offset, $postnumbers";
$sql = mysql_query($query);

//show results if there's more than one row
if (mysql_num_rows($sql) != 0) {

	echo "<div id=block>";

	while($row = mysql_fetch_array($sql)) {

		$id = $row['id'];
		echo "<div class='article' id=$id>";

		echo "<h3 id=$id>";
		$subject = $row['subject'];
		echo $subject;
		echo "</h3>";

	        echo "<div class=page-content>";
		$content = $row['content'];
		echo $content;
		echo "<br><br>";
	        echo "</div>";

		echo "</div>";
	}

	echo "</div>";
 
}

?>
