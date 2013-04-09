<html>

<?php

//include
include 'config.php';
include 'functions.php';

$offset = 0;
//number of items to load from db
$number = 25;

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "offset": "' . $offset . '", "input_category": "' . $input_category . '", "postnumbers": "' .$number . '", "input_feed": "' . $input_feed . '", "article_id": "' . $article_id . '"}');

//create new array for id of loaded articles
$stack = array();

//push id for each article to new array
if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {
    if (!empty($row)) {
      array_push($stack, $row[id]);
    }
  }
}

//implode stack, so it can be used for json call
$matches = implode(',', $stack);

?>

<head>
<meta charset="utf-8" />
<title>PHPPaper mobile</title>

<link href="stylesheets/mobile.css" rel="stylesheet" />

<?php

//TODO: proper viewport handling for iOS and other mobile browsers
if(strstr($_SERVER['HTTP_USER_AGENT'],'iPhone') || strstr($_SERVER['HTTP_USER_AGENT'],'iPod')) {
?> 
  <meta name="viewport" content="width=450, initial-scale=0.6, user-scalable=no">
<?php } elseif (strstr($_SERVER['HTTP_USER_AGENT'],'iPad')) { ?>
  <meta name="viewport" content="initial-scale=1.0, user-scalable=no">
<?php } ?>

<script type="text/javascript" src="javascripts/jquery.min.js"></script>

<script type="text/javascript">
jQuery(document).ready(function() {
  jQuery(".content").hide();
  //toggle the componenet with class msg_body
  jQuery(".heading").click(function()
  {
    $(this).find(".header-content").hide();
    jQuery(this).next(".content").slideToggle(50);
    var id = $(this).attr('id');
    console.log('clicked on id:' + id);

    //mark item as read and retrieve external url
    $.ajax(
       {
        type: "POST",
        url: "json.php",
        data: JSON.stringify({ "jsonrpc": "2.0","update": "read-status", "value": id }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        async: false,
        success: function(json) { 
         result = json;
        },
        failure: function(errMsg) {}
       }
     );
    console.log("reponse: "+ result);
    //TODO: avoid toggle or toggle back when clicking on another item like google reader
    $(this).find("span.subject").css( "color","#24b" );
    var quotelink = "<a href=" + result + " target=\"_blank\"></a>";

    //avoid adding many links
    if (!$(this).find("span.subject").hasClass("added-link") ) {
      $(this).find("span.subject").addClass("added-link");
      $(this).find("span.subject").wrap(quotelink);
    }

    //undo classes so we know if a item is collapsed or not
    if ( $(this).hasClass("collapsed") ) {
      $(this).addClass("uncollapsed");
      $(this).removeClass("collapsed")
      $(this).find(".header-content").show();
      //TODO: remove hyperlink
      //$(this).find("div.heading-top a").remove();
    } else {
      if ( $(this).hasClass("uncollapsed") ) {
        $(this).removeClass("uncollapsed")
      }
      $(this).addClass("collapsed");
    }

    //scroll item to top of page when clicking
    $(window).scrollTop($(this).position().top)

  });
});

</script>

<script type="text/javascript">

jQuery(document).ready(function() {
  jQuery("img.item-star").click(function() {
    var id = $(this).attr('id');

    //TODO: remove starred id from array, avoid marked as read when pushing mark-all-as-read button

    if ( $(this).hasClass("unstar") ) {
      console.log('starred item: ' + id);

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
      console.log('unstarred item: ' + id);

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
  });
});

</script>

<script type="text/javascript">

jQuery(document).ready(function() {
  jQuery("span#mark-these-read").click(function() {
    //$(this).css( "background-color", "yellow" );
    $.ajax(
       {
        type: "POST",
        url: "json.php",
        data: JSON.stringify({ "jsonrpc": "2.0", "update": "mark-as-read", "value": "<?php echo $matches; ?>" }),
        contentType: "application/json; charset=utf-8",
        dataType: "json",
        async: false,
        success: function(json) {
         result = json;
         //scroll to top before refresh
	 document.body.scrollTop = document.documentElement.scrollTop = 0;
         //refresh page to load new articles
         location.reload();
        },
        failure: function(errMsg) {}
       }
     );

  });
});

</script>

</head>
<body>

<div id="top">
 All items
</div>

<?php

//load content
if (!empty($array) && $array != "no-results") {

//TODO: show message when there no items unread
echo "<div id=layer1>";

  foreach ($array as $row) {

    if (!empty($row)) {

		echo "<div class='newsitem'>";

		echo "<img class='item-star unstar' id=$row[id] src='images/star_unselected.png'>";

                echo "<div class='heading' id=$row[id]>";
		echo "<div class='heading-top'>";
		
		$subject = strip_tags($row[subject]);
                $subject = preg_replace('/\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|$!:,.;]*[A-Z0-9+&@#\/%=~_|$]/i', '', $subject);
		
		echo "<span class='subject'>$subject</span>";
                echo "<span class='feedname'> - $row[feed_name]</span>";
		echo "</div>";

		echo "<div class='heading-bottom'>";
		$content = strip_tags($row[content]);
                $content = preg_replace('/\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|$!:,.;]*[A-Z0-9+&@#\/%=~_|$]/i', '', $content);
		$content = substr($content, 0, 70);

		echo "<div class='header-content'>$content....</div>";
		echo "</div>";

                echo "</div>";

                echo "<div class=content>$row[content]<br></div>";

                echo "</div>";

      }

    }

    echo "</div>";
}

?>

<div class="mark-as-read">
<span id="mark-these-read" class="">Mark these items as read</span>
</div>

<?php

?>

</body>
</html>
