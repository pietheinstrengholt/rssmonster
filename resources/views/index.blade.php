@extends('layouts.master')

@section('content')

<?php

echo "<div class=\"row\">";
echo "<div class=\"visible-lg col-lg-2\">";

//only execute the following code and show sidebar if agent is desktop
if ($format = "desktop") {

	// url variables
	$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
	$url = preg_replace('/\s+/', '', $url);

	echo "<div id=\"buttons\" class=\"btn-group btn-group-sm\" role=\"group\">";
	echo "<button id=\"unread\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
	echo "<span class=\"glyphicon glyphicon-eye-open\" aria-hidden=\"true\"></span> Unread</button>";
	echo "<button id=\"star\" style=\"width:34%;\" type=\"button\" class=\"btn btn-default\">";
	echo "<span class=\"glyphicon glyphicon-star\" aria-hidden=\"true\"></span> Star</button>";
	echo "<button id=\"read\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
	echo "<span class=\"glyphicon glyphicon-ok\" aria-hidden=\"true\"></span> Read</button>";
	echo "</div>";

	// Get overview of all categories and call function to feed sidebar
	$categories = json_decode(file_get_contents($url . '/index.php/api/category'), true);

	if (!empty($categories)) {
		echo "<div class=\"panel\">";
		
		echo "<ul id=\"all\" class=\"connected\">";
		echo "<li class=\"list-group-item main all\" draggable=\"false\"><span class=\"glyphicon glyphicon-tree-deciduous\" aria-hidden=\"true\"></span> All<span class=\"badge\">0</span></li>";
		echo "</ul>";

		foreach ($categories as $category) {

			// Get details for the category
			$category_details = json_decode(file_get_contents($url . '/index.php/api/category/' . $category['id']), true);
			
			if (!empty($category_details)) {
			
				echo "<ul id=\"$category[id]\" class=\"connected main\">";
				echo "<li id=\"$category[id]\" class=\"list-group-item main\" draggable=\"false\"><span class=\"glyphicon glyphicon-folder-close\" aria-hidden=\"true\"></span> " . substr($category['name'], 0, 16) . "<span class=\"badge\">$category_details[unread_count]</span></li>";
				echo "<li class=\"list-group-item wrapper\" draggable=\"false\"></li>";
				
				if (!empty($category_details['feeds'])) {
		
					foreach($category_details['feeds'] as $feed) {
					
						//set favicon url
						if (empty($feed['favicon'])) {
							$faviconurl = "img/rss-default.png";
						} else {
							$faviconurl = $feed['favicon'];
						}
						
						echo "<li class=\"list-group-item item\" draggable=\"true\" id=\"$feed[id]\"><img class=\"favicon\" src=\"$faviconurl\" onError=\"this.onerror=null;this.src='img/rss-default.gif';\"><span class=\"title\">" . substr($feed['feed_name'], 0, 22) . "</span><span class=\"badge\">$feed[unread_count]</span></li>";
						
					}
				}
				echo "</ul>";
			}
		}
		echo "</div>";
	}
}

echo "</div>";
echo "<div class=\"col-12 col-sm-12 col-lg-10\">";
echo "<section></section>";
echo "</div>";
echo "</div>";

?>

@stop
