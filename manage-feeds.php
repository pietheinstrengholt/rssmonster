<?php

/**
 * manage-feeds.php
 *
 * The manage-feeds.php file is used to add
 * or remove feeds and to create new categories.
 *
 */

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

include 'config.php';
include 'database.class.php';
include 'functions.php';
include 'header.php';
 
//retrieve post values
if(isset($_POST)) {

	if (!empty($_POST['feed_name']) || !empty($_POST['feed_id'])) {
	
		if(isset($_POST['feed_category'])){ $category_name = $_POST['feed_category']; } else { $category_name = "Uncategorized"; }
	
		$update = get_json('{"jsonrpc": "2.0", "update": "feeds", "feed_name": "' . $_POST['feed_name'] . '", "category_name": "' . $category_name . '", "feed_id": "' . $_POST['feed_id'] . '"}');
	}
}

?>

<script>
function DeleteFunction(feed_name,feed_id) {
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

</head>
<body>

<div class='feed-manage-overview'>

<?php

//get list with feeds and categories
$feeds = get_json('{"jsonrpc": "2.0", "request": "get-feeds"}');

if (!empty($feeds)) {
	foreach ($feeds as $feed) {

		//set feed_id variable
		$feed_id = $feed['id'];

		echo "<blockquote>";
		echo "<div class='feed-overview $feed_id'>";
		echo "<div class='feed-manage'>";

		echo "<h3 style=\"margin-left: 4px;\">" . $feed['feed_name'] . "</h3>";
		echo "<h4 style=\"margin-left: 4px;\">" . $feed['url'] . "</h4>";

		?>

		<div class="feed-information">

		<form method="post" action="manage-feeds.php" role="form">

		<fieldset>

		<div class="form-group">
		<div class="form-name"><label for="feed_name">Change display Name:</label><input type="text" class="form-control input-sm" name="feed_name" value="<?php echo $feed['feed_name']; ?>"></div>
		</div>

		<div class="form-group">
		<div class='form-category'><label for="feed_category">Change category:</label><input type="text" class="form-control input-sm" name="feed_category" value="<?php echo $feed['category_name']; ?>"></div>
		</div>

		<input type="hidden" name="feed_id" value="<?php echo $feed['id']; ?>">
		<input type="submit" value="submit" name="submit" class="btn btn-primary button-submit">

		<input type="submit" value="delete" name="delete" class="btn btn-danger button-delete" onclick="DeleteFunction('<?php echo $feed['feed_name']; ?>','<?php echo $feed['id']; ?>')" >

		</fieldset>

		</form>
		
		</div>

		<?php

		echo "</div>";
		echo "</div>";
		echo "</blockquote>";

	}
}


?>

</div>

</body>
</html>
