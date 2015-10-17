@extends('layouts.master')

@section('content')

<script>
function DeleteFunction(feed_name,feed_id) {
	var r=confirm("Are you sure to delete this feed: \"" + feed_name + "\"");
	if (r==true)
	{
		console.log(feed_id);
		$.ajax(
			{
			type: "DELETE",
			url: "api/feed/" + feed_id,
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

<?php

// url variables
$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);

// Get overview of all categories and call function to feed sidebar
$feeds = json_decode(file_get_contents($url . '/api/feed'), true);

if (!empty($feeds)) {
	foreach ($feeds as $feed) {
		//set feed_id variable
		$feed_id = $feed['id'];
		echo "<blockquote>";
		echo "<div class='feed-overview $feed_id'>";
		echo "<div class='feed-manage'>";
		echo "<h4 style=\"margin-left: 4px;\">" . $feed['feed_name'] . "</h4>";
		echo "<h5 style=\"margin-left: 4px;\">" . $feed['url'] . "</h5>";
		?>

		<div class="feed-information">

		<!--<form method="post" action="managefeeds" role="form">-->

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

		<!--</form>-->
		
		</div>

		<?php
		echo "</div>";
		echo "</div>";
		echo "</blockquote>";
	}
}
if (empty($feeds)) {
	echo "No feeds are found, please use the top menu to submit a new RSS feed.";
}


?>

@stop
