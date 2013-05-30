<?php

include 'config.php';
include 'functions.php';

?>

<html>
<head>
 <link rel="stylesheet" href="stylesheets/styles.css">
 <script src="javascripts/jquery-1.9.1.min.js"></script>
</head>
<body>

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
