<?php

//retrieve feed or category information from input argument
if(isset($_GET['feed'])) { 
  $input_feed = htmlspecialchars($_GET["feed"]);
  $input_feed = urldecode($input_feed);
}
if(isset($_GET['category'])) { 
  $input_category = htmlspecialchars($_GET["category"]);
  $input_category = urldecode($input_category);
}

//retrieve content
$data = '{"jsonrpc": "2.0", "request": "get-all-articles", "offset":"0", "postnumbers":"100", "input_category": "' . $input_category . '", 
"input_feed": "' . $input_feed . '"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {

    echo "<div id=block-short>";

    if (!empty($row)) {

                $id = $row['id'];
                echo "<div class='article-short' id=$id>";

                echo "<h3 id=$id>";
                echo "<a href=\"$url";
                echo "/index.php?article_id=$id\">";
                $subject = $row['subject'];
                echo $subject;
                echo "</a>";
                echo "</h3>";

                echo "<div class='feedname-short'>";
                $feed_name = $row['feed_name'];
                echo $feed_name;
                echo " | ";
                $publish_date = $row['publish_date'];
                echo $publish_date;
                echo "</div>";

                echo "<hr>";
                echo "</div>";

    }

    echo "</div>";
  }
}

?>

