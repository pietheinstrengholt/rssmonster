@extends('layouts.master')

@section('content')

<?php

echo "<div class=\"row\">";
echo "<div class=\"visible-lg col-lg-2\">";

// url variables
$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);

//show unread, star and read buttons
echo "<div id=\"buttons\" class=\"btn-group btn-group-sm\" role=\"group\">";
echo "<button id=\"unread\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-eye-open\" aria-hidden=\"true\"></span> Unread</button>";
echo "<button id=\"star\" style=\"width:34%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-star\" aria-hidden=\"true\"></span> Star</button>";
echo "<button id=\"read\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-ok\" aria-hidden=\"true\"></span> Read</button>";
echo "</div>";

//show empty panel, which will be deployed by the rssmonster.js
echo "<div class=\"panel\"></div>";

echo "</div>";
echo "<div class=\"col-12 col-sm-12 col-lg-10\">";

//show empty section, which will be deployed by the rssmonster.js
echo "<section></section>";
echo "</div>";
echo "</div>";

?>

@stop
