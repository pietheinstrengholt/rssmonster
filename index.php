<?php

include 'config.php';

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
    <script src="javascripts/scale.fix.js"></script>
    <script src="javascripts/infinite.js"></script>
    <link rel="stylesheet" href="stylesheets/styles.css">
    <link rel="stylesheet" href="stylesheets/pygment_trac.css">
    <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
    <!--[if lt IE 9]>
    <script src="//html5shiv.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->

    <script>

    $(document).ready(function() {

        $('#content').height($(document).height())

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
    <div class="wrapper">
      <header>
        <h1>phppaper</h1>
        <p></p>

<?php

//query data
$query = "SELECT category, count(*) as count FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' GROUP BY category ORDER BY category";
$sql = mysql_query($query);

while($row = mysql_fetch_array($sql)) {

                $category = $row['category'];
                echo $category;
		echo " ";
		echo $row['count'];
		echo "<br>";

}

?>
        <br/>
        <br />
       <!-- <h3>Appeared elements</h3> -->
       <!-- <pre><code id="appeared"></code></pre> -->
       <!-- <h3>Disappeared elements</h3> -->
       <!-- <pre><code id="disappeared"></code></pre> -->

      </header>

      <section>

<div id="content">
</div>

      </section>

      <footer>
        <!-- <p><small>by Piethein Strengholt</small></p> -->
      </footer>
    </div>

  </body>
</html>
