<?php

include 'config.php';
include 'functions.php';

?>

<!doctype html>
<html>
  <head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="chrome=1">
    <title>phppaper by Piethein Strengholt</title>
    <script src="javascripts/jquery.min.js"></script>
    <script src="javascripts/jquery.color.js"></script>
    <script src="javascripts/jquery.yellow_fade.js"></script>
    <script src="javascripts/jquery.appear.js"></script>
    <script src="javascripts/appear.openreader.js"></script>
<!--    <script src="javascripts/scale.fix.js"></script> -->
    <script src="javascripts/infinite.js"></script>
    <link rel="stylesheet" href="stylesheets/styles.css">
<!--    <link rel="stylesheet" href="stylesheets/pygment_trac.css"> -->
<!--    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"> -->
    <!--[if lt IE 9]>
    <script src="//html5shiv.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->

    <script>

    $(document).ready(function() {

        //$('#content').height($(document).height())

        $('#content').scrollPagination({

                nop     : 10, // The number of posts per scroll to be loaded
                offset  : 0, // Initial offset, begins at 0 in this case
                error   : 'No More Posts!', // When the user reaches the end this is the message that is
                                            // displayed. You can change this if you want.
                delay   : 500, // When you scroll down the posts will load after a delayed amount of time.
                               // This is mainly for usability concerns. You can alter this as you see fit
                scroll  : true // The main bit, if set to false posts will not load as the user scrolls.
                               // but will still load if the user clicks.

        });
    });

    </script>

  </head>

  <body>

      <top-nav>
      </top-nav>

    <div class="wrapper">

      <header>

<!-- <div class="debug"> -->
<!-- <h3>Appeared elements</h3> -->
<!-- <pre><code id="appeared"></code></pre> -->
<!-- <h3>Disappeared elements</h3> -->
<!-- <pre><code id="disappeared"></code></pre> -->
<!-- </div> -->

<?php

//retrieve content
$data = '{"jsonrpc": "2.0", "request": "count-all"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

echo "<div class='category-overview'>";

echo "<div class='category-main'>";
echo "<span>Overview</span>";
echo "</div>";

echo "<div class='category-all'>";
echo "<a href=\"$url";
echo "/index.php\">";
echo "<span>All</span>";
echo "</a>";
echo "<span class='category-count'>";
//echo "<pre>";
//print_r($array);
//echo "</pre>";
echo $array[0][count];
echo "</span>";

echo "</div>";

echo "</div>";

?>

<?php

echo "<div class='category-section'>";

echo "<div class='category-main'>";
echo "<span>Categories</span>";
echo "</div>";

$data = '{"jsonrpc": "2.0", "request": "overview-categories"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

if (!empty($array)) {
  foreach ($array as $row) {
    if (!empty($row)) {

		echo "<div class='category'>";
                echo "<span class='category-name'>";
		$category = $row['category'];
		echo "<a href=\"$url";
		echo "/index.php?category=$category\">";
                echo $category;
		echo "</a>";
                echo "</span>";
                echo "<span class='category-count'>";
		echo $row['count'];
                echo "</span>";
		echo "</div>";
    }
  }
}

echo "</div>";

echo "<div class='feed-section'>";

echo "<div class='feed-main'>";
echo "<span>Feeds</span>";
echo "</div>";

$data = '{"jsonrpc": "2.0", "request": "overview-feeds"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

if (!empty($array)) {
  foreach ($array as $row) {
    if (!empty($row)) {

                echo "<div class='feed'>";
                echo "<span class='feed-name'>";
                $feed = $row['name'];
                echo "<a href=\"$url";
                echo "/index.php?feed=$feed\">";
                echo $feed;
                echo "</a>";
                echo "</span>";
                echo "<span class='feed-count'>";
                echo $row['count'];
                echo "</span>";
                echo "</div>";
    }
  }
}

echo "</div>";

?>

      </header>

	<short>
<br>
<?php

//retrieve feed or category information from input argument
if(isset($_GET['feed'])) { 
  $input_feed = htmlspecialchars($_GET["feed"]);
  $input_feed = urldecode($input_feed);
}
if(isset($_GET['category'])) { 
  $input_category = htmlspecialchars($_GET["category"]);
  $input_category = urldecode($input_category);
}

//retrieve content
$data = '{"jsonrpc": "2.0", "request": "get-all-articles", "offset":"0", "postnumbers":"100", "input_category": "' . $input_category . '", "input_feed": "' . $input_feed . '"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {

    echo "<div id=block-short>";

    if (!empty($row)) {

                $id = $row['id'];
                echo "<div class='article-short' id=$id>";

                echo "<h3 id=$id>";
                $subject = $row['subject'];
                echo $subject;
                echo "</h3>";

                echo "<div class='feedname-short'>";
                $feed_name = $row['feed_name'];
                echo $feed_name;
                echo " | ";
                $publish_date = $row['publish_date'];
                echo $publish_date;
                echo "</div>";

                echo "<hr>";
                echo "</div>";

    }

    echo "</div>";
  }
}

?>

	</short>

      <section>

<br>
<h1>New articles</h1>
<br>
<div id="content">
</div>

      </section>

      <footer>
        <!-- <p><small>by Piethein Strengholt</small></p> -->
      </footer>
    </div>

  </body>
</html>
