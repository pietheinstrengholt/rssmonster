<html>
<head>
  <link rel="stylesheet" href="stylesheets/styles.css">
  <script src="javascripts/jquery-min.js"></script>
  <script src="javascripts/jquery.min.js"></script>

  <script>
  function DeleteFunction(feed_name,feed_id)
  {
  var r=confirm("Are you sure to delete this feed: \"" + feed_name + "\"");
  if (r==true)
   {

    $.ajax(
       {
        type: "POST",
        url: "json.php",
        data: JSON.stringify({ "jsonrpc": "2.0", "delete": "feed", "value": feed_id }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        async: false,
        success: function(json) {
         result = json;
         //scroll to top before refresh
	 document.body.scrollTop = document.documentElement.scrollTop = 0;
         //refresh page to load new articles
         location.reload();
        },
        failure: function(errMsg) {}
       }
     );
   }
  }
  </script>

<script type="text/javascript">
jQuery(document).ready(function() {
  jQuery(".content").hide();
  //toggle the componenet with class msg_body
  jQuery(".heading").click(function()
  {
    jQuery(this).next(".content").slideToggle(500);
  });
});
</script>


</head>
<body>
<top-nav>
 <?php include 'top-nav.php'; ?>
</top-nav>

<div class='feed-manage-overview'>

<?php

include 'config.php';
include 'functions.php';

//retrieve post values
$new_feed_name = $_POST["new_feed_name"];
$new_feed_category = $_POST["new_feed_category"];
$new_feed_id = $_POST["new_feed_id"];

if (!empty($new_feed_name) || !empty($new_feed_category)) {

  $update = get_json('{"jsonrpc": "2.0", "update": "feeds", "new_feed_name": "' . $new_feed_name . '", "new_feed_category": "' . $new_feed_category . '", "value": "' . $new_feed_id . '"}');

}

$results = get_json('{"jsonrpc": "2.0", "request": "get-feeds"}');

foreach ($results as $row) {

 if (!empty($row['id'])) {

    $feed          = $row['url'];
    $feed_id       = $row['id'];
    $feed_name     = $row['name'];
    $feed_category = $row['category'];

    echo "<div class='feed-overview $feed_id'>";

    echo "<div class='feed-manage'>";

    echo "<p class='heading'>";

    echo $feed_name;
    echo " - ";
    echo $feed;

    echo "</p>";

    ?>

    <div class='content'>
    <form method="post" action="manage-feeds.php">

    <div class='form-name'>Display name: <input type="text" name="new_feed_name" value="<?php echo $feed_name; ?>"></div>
    <div class='form-category'>Category name: <input type="text" name="new_feed_category" value="<?php echo $feed_category; ?>"></div>

    <input type="hidden" name="new_feed_id" value="<?php echo $feed_id; ?>">
    <input type="submit" value="submit" name="submit" class="button-submit">

    <input type="submit" value="delete" name="delete" class="button-delete" onclick="DeleteFunction('<?php echo $feed_name; ?>','<?php echo $feed_id; ?>')" >

    </form>
    </div>

    <?php

    echo "</div>";

    echo "</div>";

  }
}


?>

</div>

</body>
</html>
