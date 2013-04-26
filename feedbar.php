<script>

$(document).ready(function() {

$('div.main a').each(function() {
    this.href = this.href + window.location.hash;
});

});

</script>

<?php

include 'config.php';
include 'functions.php';

echo "<div class=\"nav-main\">";

function header_section($input, $name) {
  if (!empty($input)) {

    $compare = htmlspecialchars($_GET[$name]);
    
    $displayname = ucfirst($name);
    echo "<ul class='feedbar main $name'><div class=\"main\"><a href=\"#\">$displayname</a></div>";

    foreach ($input as $row) {
      if (!empty($row)) {

	$title = substr($row[name], 0, 16);

	if ($row[name] == $compare) { 
          echo "<li class='feedbar active sub $name'>";
	} else {
          echo "<li class='feedbar sub $name'>";
        }

        echo "<span class=\"title\"><a href=\"$url?$name=$row[name]\">$title</a></span>";
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
