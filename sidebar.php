<?php

/**
 * sidebar.php
 *
 * The sidebar.php file is used for navigation
 * on the left side of the page. Only displayed on
 * large screens, not on small devices.
 *
 */

include 'config.php';
include 'functions.php';

echo "<div class=\"organize\">";
echo "<button class='btn btn-small btn-success mark-all-as-read' type='button'>Mark all as read</button>";
echo "<a href=\"manage-feeds.php\" role=\"button\" class=\"btn btn-small btn-primary organize-feeds\">Organize Feeds</a>";
echo "</div>";

//Show status menu (unread, read, starred items). The count for each category added by the rssmonster javascript when loading article items
echo "<div class=\"panel\" id=\"status\">";
echo "<a href=\"#\" class=\"list-group-item active\"><b>Status menu items</b></a>";

echo "<a href=\"#\" id=\"unread\" class=\"list-group-item\">";
echo "<span class=\"unread badge\"></span>";
echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-sunglasses\"></span><span id=\"title-name\">unread</span></span>";
echo "</a>";

echo "<a href=\"#\" id=\"read\" class=\"list-group-item\">";
echo "<span class=\"read badge\"></span>";
echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-pencil\"></span><span id=\"title-name\">read</span></span>";
echo "</a>";

echo "<a href=\"#\" id=\"starred\" class=\"list-group-item\">";
echo "<span class=\"starred badge\"></span>";
echo "<span id=\"title-bar\"><span class=\"glyphicon glyphicon-star\"></span><span id=\"title-name\">starred</span></span>";
echo "</a>";

echo "</div>";

//empty panel for categories, to be filled by rssmonster javascript
echo "<div class=\"panel\" id=\"categories\"></div>";


?>
