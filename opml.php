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
<br><br>
<form action="opmlhandler.php" method="post"
enctype="multipart/form-data">
<label for="file">Filename:</label>
<input type="file" name="file" id="file"><br>
<input type="submit" name="submit" value="Submit">
</form>
</result>
</body>
</html>
