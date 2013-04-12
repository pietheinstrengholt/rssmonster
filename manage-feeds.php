<html>
<head>
 <?php include 'header.php'; ?>
  <script src="http://code.jquery.com/jquery-1.9.1.js"></script>
  <script src="http://code.jquery.com/ui/1.10.2/jquery-ui.js"></script>

<script>
function myFunction(feed_name,feed_id)
{
var r=confirm("Are you sure to delete this feed: \"" + feed_name + "\"");
if (r==true)
  {

    $.ajax(
       {
        type: "POST",
        url: "json.php",
        data: JSON.stringify({ "jsonrpc": "2.0", "delete": "feed", "value": feed_id }),
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

  }
document.getElementById("demo").innerHTML=x;
}
</script>


</head>
<body>
<top-nav>
 <?php include 'top-nav.php'; ?>
</top-nav>

<div class='feed-manage-overview'>

<?php

include 'config.php';

$query = "select * from feeds order by name";
$sql = mysql_query($query);
asort($sql);

while ($row = mysql_fetch_array($sql)) {

    $feed      = $row['url'];
    $feed_id   = $row['id'];
    $feed_name = $row['name'];

    echo "<div class='feed-delete'><img class='item-delete' src='images/delete.png' onclick=\"myFunction('$feed_name','$feed_id')\"></div>";
    echo "<div class='feed-edit'><img class='item-delete' src='images/edit.png'></div>";

    echo "<div class='feed-manage'>";

    echo $feed_name;
    echo " - ";
    echo $feed;
    echo "</div><br>";

}

?>

</div>

</body>
</html>
