<html>
<head>

<meta charset="utf-8" />
<title>PHPPaper mobile</title>

<link href="stylesheets/mobile.css" rel="stylesheet" />
<script type="text/javascript" src="javascripts/jquery-1.9.1.min.js"></script>

<?php

//input
$input_feed = htmlspecialchars($_GET["feed"]);
$input_category = htmlspecialchars($_GET["category"]);

//TODO: proper viewport handling for iOS and other mobile browsers
if(strstr($_SERVER['HTTP_USER_AGENT'],'iPhone') || strstr($_SERVER['HTTP_USER_AGENT'],'iPod')) {
?> 
  <meta name="viewport" content="initial-scale=0.6, user-scalable=no">
<?php } elseif (strstr($_SERVER['HTTP_USER_AGENT'],'iPad')) { ?>
  <meta name="viewport" content="initial-scale=1.0, user-scalable=no">
<?php } 
?>

</head>

<body>

<div id="top">
 <div class="m-button back-to-feeds" id="back-to-feeds"><span class="m-button-contents"><a href="mobile-feeds.php">Feeds</a></span></div>
 
 <div id="nav-title">
 <?php if (!empty($input_feed)) { 
	echo $input_feed; 
	} elseif (!empty($input_category)) {
	echo $input_category;
	} else {
	echo "All items";
	}
 ?>
 </div>
 <div class="r-button" id="header-refresh" style="background-image: url(images/arrow.png);"><span class="m-button-contents"></span></div>
</div>

<div id="nav-bar-shadow"></div>

<div id="content">
<?php include 'mobile-view.php'; ?>
</div>

<div id="entries-footer" class="nav-bar">
  <!-- <div class="m-button back-to-feeds" id="back-to-feeds"><span class="m-button-contents"><a href="mobile-feeds.php">Feeds</a></span></div> -->
</div>

</body>
</html>
