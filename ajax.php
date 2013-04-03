<?php

//include
include 'config.php';
include 'functions.php';

//retrieve feed or category information from infinite.js
$input_feed = htmlspecialchars($_POST["feed_name"]);
$input_category = htmlspecialchars($_POST["category_name"]);
$article_id = htmlspecialchars($_POST["article_id"]);

//urldecode post input
$input_feed = urldecode($input_feed);
$input_category = urldecode($input_category);

//receive numbers of posts to load from infinite.js
$offset = is_numeric($_POST['offset']) ? $_POST['offset'] : die();
$postnumbers = is_numeric($_POST['number']) ? $_POST['number'] : die();

//retrieve content
$data = '{"jsonrpc": "2.0", "request": "get-all-articles", "offset": "' . $_POST['offset'] . '", "input_category": "' . $input_category . '", "postnumbers": "' . 
$_POST['number'] . '", "input_feed": "' . $input_feed . '", "article_id": "' . $article_id . '"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

//only get article once
if (!empty($article_id) && $offset != "0") { die(); }

if ($array == "no-results" ) {
  //echo "array is empty";
  $data = '{"jsonrpc": "2.0", "update": "mark-all-as-read", "input_feed": "' . $input_feed . '", "input_category": "' . $input_category . '"}';
  curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
  $array = json_decode(curl_exec($ch),true);
  die();
}

if (!empty($array) && $array != "no-results") {
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

?>

<script type="text/javascript">
  $.force_appear();
</script>

<?php

}

?>
