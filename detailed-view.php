<?php

include 'config.php';
include 'functions.php';

?>

<html>
<head>
    <script src="javascripts/jquery.bullseye-1.0-min.js"></script>
    <script src="javascripts/infinite.js"></script>

    <script>

    //infinite.js parameters
    $(document).ready(function() {
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

//TODO: Target future elements from header instead of using workaround with array check.
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

</head>
<body>
 <div id="content"></div>
</body>
</html>
