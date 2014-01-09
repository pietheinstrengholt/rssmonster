<html>
<head>
  <script src="javascripts/jquery-1.10.2.min.js"></script>

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

<div class='feed-manage-overview'>

<?php

include 'config.php';
include 'functions.php';

//retrieve post values
if(isset($_POST['new_feed_name'])){ $new_feed_name = $_POST['new_feed_name']; } else { $new_feed_name = NULL; }
if(isset($_POST['new_feed_category'])){ $new_feed_category = $_POST['new_feed_category']; } else { $new_feed_category = NULL; }
if(isset($_POST['new_feed_id'])){ $new_feed_id = $_POST['new_feed_id']; } else { $new_feed_id = NULL; }

if (!empty($new_feed_name) || !empty($new_feed_category)) {

  $update = get_json('{"jsonrpc": "2.0", "update": "feeds", "new_feed_name": "' . $new_feed_name . '", "new_feed_category": "' . $new_feed_category . '", "value": "' . $new_feed_id . '"}');
  header("Location: $url");
  exit;
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

    echo "<b>" . $feed_name . "</b>";
    echo " - ";
    echo $feed;

    echo "</p>";

    ?>

    <div class='content'>
    <form method="post" action="manage-feeds.php" role="form">

<fieldset>

<div class="form-group">
    <div class='form-name'><label for="new_feed_name">Display Name:</label><input type="text" class="form-control input-sm" name="new_feed_name" value="<?php echo $feed_name; ?>"></div>
</div>

<div class="form-group">
    <div class='form-category'><label for="new_feed_category">Category:</label><input type="text" class="form-control input-sm" name="new_feed_category" value="<?php echo $feed_category; ?>"></div>
</div>

    <input type="hidden" name="new_feed_id" value="<?php echo $feed_id; ?>">
    <input type="submit" value="submit" name="submit" class="btn btn-default button-submit">

    <input type="submit" value="delete" name="delete" class="btn btn-default button-delete" onclick="DeleteFunction('<?php echo $feed_name; ?>','<?php echo $feed_id; ?>')" >

</fieldset>

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
