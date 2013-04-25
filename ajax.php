<?php

//include
include 'config.php';
include 'functions.php';

//retrieve feed or category information from infinite.js
$input_feed = htmlspecialchars($_POST["feed_name"]);
$input_category = htmlspecialchars($_POST["category_name"]);
$article_id = htmlspecialchars($_POST["article_id"]);
$status = htmlspecialchars($_POST["status"]);

//urldecode post input
$input_feed = urldecode($input_feed);
$input_category = urldecode($input_category);

//receive numbers of posts to load from infinite.js
$offset = is_numeric($_POST['offset']) ? $_POST['offset'] : die();
$postnumbers = is_numeric($_POST['number']) ? $_POST['number'] : die();

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "offset": "' . $_POST['offset'] . '", "input_category": "' . $input_category . '", "postnumbers": "' .$_POST['number'] . '", "input_feed": "' . $input_feed . '", "article_id": "' . $article_id . '", "status": "' . $status . '"}');

//only get article once
if (!empty($article_id) && $offset != "0") { die(); }

//if no results are returned mark items as read
if ($array == "no-results" ) {
  $array = get_json('{"jsonrpc": "2.0", "update": "mark-as-read", "input_feed": "' . $input_feed . '", "input_category": "' . $input_category . '", "status": "' . $status . '"}');
  die();
}

//load content
if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {

    echo "<div id=block class=$offset>";

    if (!empty($row)) {

                echo "<div class='article' id=$row[id]>";

		if ($row[star_ind] == '1') {
	                echo "<img class='item-star star $offset' id=$row[id] src='images/star_selected.png'>";
		} else {
                        echo "<img class='item-star unstar $offset' id=$row[id] src='images/star_unselected.png'>";
		}

                echo "<h3 class='heading' id=$row[id]><a href=\"$row[url]\" target=\"_blank\">$row[subject]</a></h3>";
                echo "<div class='feedname'>$row[feed_name] | $row[publish_date]</div>";
                echo "<hr>";
                echo "<div class='page-content'>$row[content]</div>";
                echo "</div>";

    }
  echo "</div>";
  }
}

?>

<script type="text/javascript">

//TODO: Target future elements from header instead of using dirty workaround with array check.
var pool = new Array();

// Create your event handlers
function myHandler(e) {
    var id = $(this).attr('id');

    if(jQuery.inArray(id,pool) == -1) {
      // the element is not in the array
      console.log($(this).attr('id') + ': ' + e.type);
      pool.push(id);
      //$("feedbar").load("feedbar.php");


      $.ajax(
       {
        type: "POST",
        url: "json.php",
        data: JSON.stringify({ "jsonrpc": "2.0","update": "read-status", "value": id }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        success: function(data){},
        failure: function(errMsg) {}
       }
     );
  };
}

// Inside DOM-Loaded event
$('div#block h3').bind('leaveviewport', myHandler).bullseye();

</script>


<script>

  //TODO: this workaround is really dirty. The best way to target these elements is from the header. 
  //But since these are future elements the JS is put over here.
  //Problem is that the ajax.php is called several times, therefor a check on offset is performed.
  console.log('load script with offset: <?php echo $offset; ?>');
  $("img.item-star").click(function() {

    var offset = <?php echo $offset; ?>;
    var id = $(this).attr('id');

    if ( $(this).hasClass(offset) ) {

      if ( $(this).hasClass("unstar") ) {

        console.log('starred item: ' + id + ' with offset: ' + offset);

        $.ajax(
         {
          type: "POST",
          url: "json.php",
          data: JSON.stringify({ "jsonrpc": "2.0", "update": "star-mark", "value": id }),
          contentType: "application/json; charset=utf-8",
          dataType: "json",
          async: false,
          success: function(json) {
           result = json;
          },
          failure: function(errMsg) {}
         }
        );

       $(this).attr('src', 'images/star_selected.png');
       $(this).removeClass("unstar");
       $(this).addClass("star");

     } else if ( $(this).hasClass("star") ) {

        console.log('unstarred item: ' + id + ' with offset: ' + offset);

        $.ajax(
         {
          type: "POST",
          url: "json.php",
          data: JSON.stringify({ "jsonrpc": "2.0", "update": "star-unmark", "value": id }),
          contentType: "application/json; charset=utf-8",
          dataType: "json",
          async: false,
          success: function(json) {
           result = json;
          },
          failure: function(errMsg) {}
         }
        );

       $(this).attr('src', 'images/star_unselected.png');
       $(this).removeClass("star");
       $(this).addClass("unstar");

     }
    }

  });

</script>

