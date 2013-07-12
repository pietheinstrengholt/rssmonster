<?php

//include
include 'config.php';
include 'functions.php';

//input
if(isset($_GET["feed"])){ $input_feed = htmlspecialchars($_GET["feed"]); } else { $input_feed = NULL; }
if(isset($_GET["category"])){ $input_category = htmlspecialchars($_GET["category"]); } else { $input_category = NULL; }
if(isset($_GET["status"])){ $status = htmlspecialchars($_GET["status"]); } else { $status = NULL; }
if(isset($_GET["article_id"])){ $article_id = htmlspecialchars($_GET["article_id"]); } else { $article_id = NULL; }
if(isset($_GET["sort"])){ $sort = htmlspecialchars($_GET["sort"]); } else { $sort = NULL; }

$offset = 0;
//number of items to load from db
$number = 25;

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "offset": "' . $offset . '", "input_category": "' . $input_category . '", "postnumbers": "' .$number . '", "input_feed": "' . $input_feed . '", "article_id": "' . $article_id . '", "status": "' . $status . '", "sort": "' . $sort . '"}');

//create new array for id of loaded articles
$stack = array();

//push id for each article to new array
if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {
    if (!empty($row)) {
      array_push($stack, $row['id']);
    }
  }
}

//implode stack, so it can be used for json call
$matches = implode(',', $stack);

?>

<head>

<script type="text/javascript">

jQuery(document).ready(function () {

    var matches = "<?php echo $matches; ?>";

    $("span#mark-these-read").click(function () {
        $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "mark-as-read",
                "value": matches
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            async: false,
            success: function (json) {
                result = json;
                //scroll to top before refresh
                document.body.scrollTop = document.documentElement.scrollTop = 0;
                //refresh page to load new articles
                location.reload();
            },
            failure: function (errMsg) {}
        });

    });

    //hide all news-content items by default
    $(".news-content").hide();
    $("span.subjecturl").hide();

    //jQuery(".heading").click(function () {
    $("section").on("click", ".heading", function (event) {

	//change active newsitem to unactive newsitem and add read class
	$("div#layer1").find(".active-newsitem").find(".header-content").show();
	$("div#layer1").find(".active-newsitem").find(".news-content").hide();
	$("div#layer1").find(".active-newsitem").find("span.subject").show();
	$("div#layer1").find(".active-newsitem").find("span.subjecturl").hide();
	$("div#layer1").find(".active-newsitem").addClass("read-newsitem");
	$("div#layer1").find(".active-newsitem").removeClass("active-newsitem");

        var id = $(this).attr('id');
        console.log('clicked on id:' + id);

	//hide header content and show news content
        $(this).find(".header-content").hide();
	$(this).find("span.subject").hide();
	$(this).find("span.subjecturl").show();
        $(this).next(".news-content").slideToggle(50);

	//remove any active-newsitem classes and add active-newsitem class
	$("div#layer1").find(".active-newsitem").removeClass("active-newsitem");
	$("div#layer1").find('div#' + id + '.newsitem').addClass("active-newsitem");
	$("div#layer1").find(".active-newsitem").removeClass("read-newsitem");
 
       //mark item as read and retrieve external url
        $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "read-status",
                "value": id
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            async: false,
            success: function (json) {
                result = json;
            },
            failure: function (errMsg) {}
        });
    });
});

</script>

</head>

<?php

//load content
if (!empty($array) && $array != "no-results") {

echo "<div id=layer1>";

  foreach ($array as $row) {

    if (!empty($row)) {

		echo "<div class='newsitem' id=$row[id]>";

		if ($row['star_ind'] == '1') {
			echo "<img class='item-star star' id=$row[id] src='images/star_selected.png'>";
		} else {
			echo "<img class='item-star unstar' id=$row[id] src='images/star_unselected.png'>";
		}

                echo "<div class='heading' id=$row[id]>";
		echo "<div class='heading-top'>";

		$feedurl = $row['url'];		
		$subject = strip_tags($row['subject']);
                $subject = preg_replace('/\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|$!:,.;]*[A-Z0-9+&@#\/%=~_|$]/i', '', $subject);

		if (!empty($row['author'])) {		
			echo "<span class='subject'>$subject by $row[author]</span>";
			echo "<a href=\"$feedurl\" target=\"_blank\"><span class='subjecturl'>$subject by $row[author]</span></a>";
		} else {
                        echo "<span class='subject'>$subject</span>";
			echo "<a href=\"$feedurl\" target=\"_blank\"><span class='subjecturl'>$subject</span></a>";
		}
                echo "<span class='feedname'> - $row[feed_name]</span>";
		echo "<span class='publish_date'> // $row[publish_date]</span>"; 
		echo "</div>";

		echo "<div class='heading-bottom'>";
		$content = strip_tags($row['content']);
                $content = preg_replace('/\b(https?|ftp|file):\/\/[-A-Z0-9+&@#\/%?=~_|$!:,.;]*[A-Z0-9+&@#\/%=~_|$]/i', '', $content);
		$content = substr($content, 0, 250);

		echo "<div class='header-content'>$content....</div>";
		echo "</div>";

                echo "</div>";

                echo "<div class=news-content>$row[content]<br></div>";

                echo "</div>";

      }

    }

    echo "</div>";
} else {
  echo "<div class=\"all-read\">";
  echo "All items marked as read";
  echo "</div>";
}

if (!empty($array) && $array != "no-results") {

?>

<div id="result-dialog">
<?php 

if (!empty($array) && $array != "no-results") {
  print count($array); 
  echo " item";
  if (count($array) > 1) {
    echo "s";
  }
}

?>
</div>

<div class="mark-as-read">
 <span id="mark-these-read" class="">Mark these items as read</span>
</div>

<?php

}

?>
