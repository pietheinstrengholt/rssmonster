<link href="feedbar.css" rel="stylesheet" />
<script type="text/javascript" src="javascripts/jquery.min.js"></script>
<script type="text/javascript" src="javascripts/jquery.cookie.js"></script>
<script src="javascripts/jquery.bullseye-1.0-min.js"></script>
<script src="javascripts/infinite.js"></script>

<script>

//TODO: read window.location.hash and if set reload section with post parameters

$(document).ready(function() {

//loadscrollPagination function to load items when scrolling. Remember to use: $(window).off("scroll");
function loadscrollPagination(category,feed) {
  setTimeout(function() {

    $('#content').scrollPagination({
                nop     : 10, // The number of posts per scroll to be loaded
                offset  : 0, // Initial offset, begins at 0 in this case
                error   : 'No More Posts!', // When the user reaches the end this is the message that is
                delay   : 500, // When you scroll down the posts will load after a delayed amount of time.
                scroll  : true, // The main bit, if set to false posts will not load as the user scrolls.
                category: category, // Catch category from menu
                feed    : feed // Catch feedname from menu
    });
  }, 100);
}

//get hashtag value from url
var request = window.location.hash;
request = request.slice( 1 );
console.log("hashtag value from url:" + request);

//set cookie for view, if not set
if ($.cookie('view') == 'undefined') {
  console.log("cookie undefined, set cookie");
  $.cookie('view', 'detailed', { expires: 14 });
} else {
  console.log("cookie found with current view type: " + $.cookie('view'));
}

//get viewtype from cookie
var viewtype = $.cookie('view');
console.log("current view type = " + viewtype);

//load list view is cookie is set to list view
if (viewtype == 'list') {
 var encoded = encodeURIComponent(request); 
 $('section').load(viewtype + '-view.php?category=' + encoded);
} else {
 var encoded = encodeURIComponent(request);
 viewtype="detailed";
 $('section').load(viewtype + '-view.php');
}

//remember windows location hash (obsolete)
$('div.main a').each(function() {
    this.href = this.href + window.location.hash;
});

//Drop down menu items from feedbar
jQuery("ul.feedbar ul").hide();
  jQuery("li.main").click(function()
  {

    var category = $(this).find("span.title").text();
    console.log("Clicked on category: " + category);
    console.log("viewtype = " + viewtype);
    var encoded_category = encodeURIComponent(category);

    if (viewtype == 'detailed') {

      $('section #content').remove();
      $('section').append('<div id="content"></div>');
      $(window).off("scroll");
      loadscrollPagination(encoded_category,'');

    } else {
      $('section').load('list-view.php?category=' + encoded_category);
    }

    window.location.hash = '#category=' + encoded_category;
    jQuery(this).next("ul.feedbar ul").slideToggle(200);

    if ( $(this).hasClass("clicked") ) {
      $(this).removeClass("clicked");
      $(this).css( "background-color", "" );
    } else {
      $(this).addClass("clicked");
      $(this).css( "background-color", "#E8E8E8" );
    }
});

//Selection and load sub menu items from feedbar
jQuery("li.sub").click(function() {
  var feed = $(this).find("span.title").text();
  console.log("Clicked on feed: " + feed);
  var encoded_feed = encodeURIComponent(feed);
  window.location.hash = '#feed=' + encoded_feed;
  if (viewtype == 'detailed') {

    $('section #content').remove();
    $('section').append('<div id="content"></div>');
    $(window).off("scroll");
    loadscrollPagination('',encoded_feed);

  } else {
    $('section').load('list-view.php?feed=' + encoded_feed);
  }

});

//List view button
jQuery("div.list").click(function() {
  console.log("switched to list view");
  $.cookie('view', 'list', { expires: 14 });
  viewtype="list";
  $('section').load('list-view.php?' + request);
});

//Detailed view button
jQuery("div.detailed").click(function() {

  //set cookie and variable to detailed view
  console.log("switched to detailed view");
  $.cookie('view', 'detailed', { expires: 14 });
  viewtype="detailed";

  //remove existing content and add empty again
  $('section').empty();
  $('section #content').remove();
  $('section').append('<div id="content"></div>');

  //disable existing scroll and load loadscrollPagination
  $(window).off("scroll");
  loadscrollPagination();

});

});

//event when marking item as starred
$("body").on("click", "img.item-star.unstar", function(event){
    var id = $(this).attr('id');
    console.log('starred item: ' + $(this).attr('id'));
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

});

//event when unstaring item
$("body").on("click", "img.item-star.star", function(event){
    var id = $(this).attr('id');
    console.log('unstarred item: ' + $(this).attr('id'));
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

});

</script>

<script type="text/javascript">

//infinite.js script is used to call the myHandler function

//create pool for article id's, this to avoid that an article is marked as read twice or more
var pool = new Array();

//create event handler
function myHandler(e) {
    var id = $(this).attr('id');

    //the article id is not in the array
    if(jQuery.inArray(id,pool) == -1) {

      //debug message to console
      console.log($(this).attr('id') + ': ' + e.type);

      //push article id to array
      pool.push(id);

      //mark item as read with json call
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

</script>

<?php

include 'config.php';
include 'functions.php';

echo "<div class=\"list\">List view</div>";
echo "<div class=\"detailed\">Detailed view</div>";

echo "<div class=\"nav-main\">";

function header_section($input, $name) {
  if (!empty($input)) {
  
    $displayname = ucfirst($name);
    echo "<ul class='feedbar'>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row[category], 0, 16);

        echo "<li class='main'>";
	echo "<span class=\"title\">$title</span>";
        echo "<span class=\"count\">$row[count_all]</span>";
	echo "<span class=\"count\"> / </span>";
        echo "<span class=\"count\">$row[count_unread]</span>";
        echo "</li>";

        echo "<ul>";

	$result = mysql_query("SELECT name, id, favicon FROM feeds WHERE category = '$row[category]'");

	while ($row = mysql_fetch_array($result, MYSQL_NUM)) {
		echo "<li class=\"sub\"><span class=\"favicon\"><img class=\"favicon\" src=\"$row[2]\"></img></span><span class=\"title\">$row[0]</span></li>";

	}

	mysql_free_result($result);

        echo "</ul>";

      }
    }
    echo "</ul>";
  }
}

$array = get_json('{"jsonrpc": "2.0", "overview": "categories-detailed"}');
header_section($array,'category');

echo "</div>";

?>
