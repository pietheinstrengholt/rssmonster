<?php

include 'config.php';
include 'functions.php';

?>

<html>
<head>
 <?php include 'header.php'; ?>
</head>
<body>
<top-nav>
 <?php include 'top-nav.php'; ?>
</top-nav>

<result>
<div class="opml-form">
Coming from Google Reader? Use Google Reader export to get your Google Reader subscriptions into a .xml file.<br>

<form action="opmlhandler.php" method="post" enctype="multipart/form-data">
<label for="file">Filename:</label>
<input type="file" name="file" id="file"><br>
<input type="submit" name="submit" value="Submit">
</form>
</div>
</result>
</body>
</html>
