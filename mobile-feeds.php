<html>
<?php

//include
include 'config.php';
include 'functions.php';

?>

<head>
 <link href="stylesheets/mobile.css" rel="stylesheet" />
</head>
<body>

<div id="top">
</div>

<?php

echo "<div class=\"nav-main\">";

function header_section($input, $name) {
  if (!empty($input)) {

    $displayname = ucfirst($name);
    echo "<ul class='feedbar main $name'><div class=\"main\"><a href=\"#\">$displayname</a></div>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row[name], 0, 36);
        echo "<li class='feedbar sub $name'>";
        echo "<span class=\"title\"><a href=\"$url./mobile.php?$name=$row[name]\">$title</a></span>";
        echo "<span class=\"count\">$row[count]</span>";
        echo "</li>";
      }
    }
    echo "</ul>";
  }
}

$array = get_json('{"jsonrpc": "2.0", "overview": "status"}');
header_section($array,'status');

$array = get_json('{"jsonrpc": "2.0", "overview": "categories"}');
header_section($array,'categories');

$array = get_json('{"jsonrpc": "2.0", "overview": "feeds"}');
header_section($array,'feeds');

echo "</div>";

?>

</body>
</html>
