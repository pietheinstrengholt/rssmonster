<?php

include 'config.php';
include 'functions.php';

?>

<html>
<head>
 <link rel="stylesheet" href="stylesheets/styles.css">
 <script src="javascripts/jquery-1.9.1.min.js"></script>
 <script src="javascripts/bootstrap.file-input.js"></script>
</head>
<body>

<result>
<div class="opml-form">
Use the browse button below to upload your OPML XML file.<br><small>Coming from Google Reader? Use Google Reader export to get your Google Reader subscriptions into a 
.xml</small>
file.<br><br>

<form action="opmlhandler.php" method="post" enctype="multipart/form-data">

<input type="file" name="file" id="file"><br>
<br>

Parsing all URLs for favoicons will cost performance. Please select the checkbox below to download favoicons for all URLs<br><br>
<label class="checkbox">
        <input type="checkbox" name="favoicon" value="Yes"> Download favo icons
</label>
<br>

<input type="submit" name="submit" value="Submit" class="btn btn-primary">
</form>
</div>
</result>
</body>
</html>
