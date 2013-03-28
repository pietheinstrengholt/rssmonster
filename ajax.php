<?php

//include
include 'config.php';
include 'functions.php';

//retrieve feed or category information from infinite.js
$input_feed = htmlspecialchars($_POST["feed_name"]);
$input_category = htmlspecialchars($_POST["category_name"]);

//urldecode post input
$input_feed = urldecode($input_feed);
$input_category = urldecode($input_category);

//receive number of posts to receive from infinite.js
$offset = is_numeric($_POST['offset']) ? $_POST['offset'] : die();
$postnumbers = is_numeric($_POST['number']) ? $_POST['number'] : die();

//prepare the field values being posted to the service
if (!empty($input_feed)) {
  $data = '{"jsonrpc": "2.0", "request": "get-all-articles", "offset": 0, "postnumbers": 10, "input_feed": "' . $input_feed . '"}';
} elseif (!empty($input_category)) {
  $data = '{"jsonrpc": "2.0", "request": "get-all-articles", "offset": 0, "postnumbers": 10, "input_category": "' . $input_category . '"}';
} else {
  $data = '{"jsonrpc": "2.0", "request": "get-all-articles", "offset": 0, "postnumbers": 10}';
}

curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

if (!empty($array)) {
  foreach ($array as $row) {

    echo "<div id=block>";

    if (!empty($row)) {

                $id = $row['id'];
                echo "<div class='article' id=$id>";

                echo "<h3 id=$id>";
                $subject = $row['subject'];
                echo $subject;
                echo "</h3>";

                echo "<div class='feedname'>";
                $feed_name = $row['feed_name'];
                echo $feed_name;
                echo " | ";
                $publish_date = $row['publish_date'];
                echo $publish_date;
                echo "</div>";

                echo "<hr>";
                echo "<div class=page-content>";
                $content = $row['content'];
                echo $content;
                echo "<br><br>";
                echo "</div>";

                echo "</div>";

    }

    echo "</div>";
  }
}

?>
