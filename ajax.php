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
$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "offset": "' . $_POST['offset'] . '", "input_category": "' . $input_category . '", "postnumbers": "' .$_POST['number'] . '", "input_feed": "' . $input_feed . '", "article_id": "' . $article_id . '"}');

//only get article once
if (!empty($article_id) && $offset != "0") { die(); }

//if no results are returned mark items as read
if ($array == "no-results" ) {
  $array = get_json('{"jsonrpc": "2.0", "update": "mark-as-read", "input_feed": "' . $input_feed . '", "input_category": "' . $input_category . '"}');
  die();
}

//load content
if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {

    echo "<div id=block>";

    if (!empty($row)) {

                echo "<div class='article' id=$row[id]>";

                echo "<h3 id=$id>$row[subject]</h3>";

                echo "<div class='feedname'>$row[feed_name] | $row[publish_date]</div>";

                echo "<hr>";

                echo "<div class=page-content>$row[content]<br><br></div>";

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
