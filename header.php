<?php

function header_section($input, $name) {
  if (!empty($input)) {

    echo "<ul class='feedbar main $name'><li class='index-name'>$name</li>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row[name], 0, 16);
        echo "<li class='feedbar sub $name'>";
        echo "<span class=\"title\"><a href=\"$url?$name=$row[name]\">$title</a></span>";
        echo "<span class=\"count\">$row[count]</span>";
        echo "</li>";
      }
    }
  } 
  echo "</ul>";
}

$array = get_json('{"jsonrpc": "2.0", "overview": "status"}');
header_section($array,'status');

$array = get_json('{"jsonrpc": "2.0", "overview": "categories"}');
header_section($array,'categories');

$array = get_json('{"jsonrpc": "2.0", "overview": "feeds"}');
header_section($array,'feeds');

?>
