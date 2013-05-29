<?php

include 'config.php';
include 'functions.php';

?>

<html>
<head>
 <link rel="stylesheet" href="stylesheets/styles.css">
 <script src="javascripts/jquery.min.js"></script>
</head>

<result>
<div class="opml-form">

<div class="alert alert-info">
  <button type="button" class="close" data-dismiss="alert">&times;</button>
  <strong>Coming from Google Reader?</strong>  Use Google Reader export to get your Google Reader subscriptions into a .xml file.
</div>

<form action="opmlhandler.php" method="post" enctype="multipart/form-data">
 <fieldset>
   <legend>OPML Wizard</legend>
   <label>Filename</label>
   <input type="file" title="Search for a file to add">
 </fieldset>
<button type="submit" class="btn">Submit</button>
</form>
</div>
</result>
