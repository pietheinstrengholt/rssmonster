<html>

<?php

//include
include 'config.php';
include 'functions.php';

$offset = "0";
$postnumbers = "10";

//retrieve content
$array = get_json('{"jsonrpc": "2.0", "request": "get-articles", "offset": "' . $offset . '", "input_category": "' . $input_category . '", "postnumbers": "' .$postnumbers . '", "input_feed": "' . $input_feed . '", "article_id": "' . $article_id . '", "status": "' . $status . '"}');

?>

<head>
    <title>jQuery Bullseye - Viewport detection plug-in for jQuery! | Documentation and Demos</title>
    <script type="text/javascript" src="http://ajax.googleapis.com/ajax/libs/jquery/1.4/jquery.min.js"></script>
    <script type="text/javascript" src="javascripts/jquery.bullseye-1.0.js"></script>
    <link rel="Stylesheet" type="text/css" href="samples-global.css" />
    <link rel="stylesheet" href="stylesheets/styles.css">

    <script type="text/javascript">

	//set minimum start of counting items
	if (typeof items === 'undefined') {
	    var items=10;
	}

	//create pool with all items
	var pool = new Array();

	function Handler(e) {

		console.log("viewport detection for id: " + $(this).attr('id'));

                if (e.type == 'leaveviewport') {
                    console.log("leaveviewport: " + $(this).attr('id'));
                }

                if (e.type == 'enterviewport') {
                    console.log("enterviewport: " + $(this).attr('id'));
                }

                //declare id
                var id = $(this).attr('id');

                //push to pool
                if(jQuery.inArray(id,pool) == -1) {
                    pool.push(id);

		    $.ajax(
		       {
		        type: "POST",
		        url: "json.php",
		        //data: JSON.stringify({ "jsonrpc": "2.0", "request": "get-articles", "offset": "11", "postnumbers": "1" }),
                        data: JSON.stringify({ "jsonrpc": "2.0", "request": "get-articles", "offset": items, "postnumbers": "1" }),
		        contentType: "application/json; charset=utf-8",
		        dataType: "json",
		        async: false,
		        success: function(json) { 
		         result = json;
		        },
		        failure: function(errMsg) {}
		       }
		    );

		    //console.log(result);

		    console.log(result[0].subject);
		    console.log(result[0].id);
                    console.log(result[0].feed_name);
                    console.log(result[0].status);


		    //var str = JSON.stringify(result);
                    //console.log("json is:" + str);
	   

                    //get new id
                    items++;

			var myString = '<div class=\"bullseye block\" id=\"' + result[0].id + '\">' +
			'<h2>Box ' + result[0].id + '</h2>' +
			'<p>Check the output log for events.</p></div>';

			$('.blockcontainer').append(myString);

                    //$('.blockcontainer').append("<div class=\"bullseye block\" id=" + result[0].id + "><h2>Box " + result[0].id + "</h2><p>Check the output log for events.</p></div>");
		    activatebullseye(items);

                }
	}

	function activatebullseye(id) {
	    //in plaats van op alle bullseye elementen de functie te plaatsen maak specifiek voor alleen nieuw id
	    if (id) {
              $('.bullseye#' + id).bind('enterviewport', Handler).bind('leaveviewport', Handler).bullseye();
	      console.log("initialize bullseye for id: " + id);
            } else {
              console.log("initialize bullseye for all items in the block");
              $('.bullseye').bind('enterviewport', Handler).bind('leaveviewport', Handler).bullseye();
            }
	}

	$(document).ready(function() {
	    activatebullseye();
	});
		
    </script>
</head>
<body>

<div class="blockcontainer">

<?php

//load content
if (!empty($array) && $array != "no-results") {
  foreach ($array as $row) {

    echo "<div class=\"bullseye block\" id=\"$row[id]\">";

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

  </div>

</body>
</html>

