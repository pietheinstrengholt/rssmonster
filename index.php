<?php

$actual_link = "http://$_SERVER[HTTP_HOST]$_SERVER[REQUEST_URI]";
header("Location: " . $actual_link . "public/index.php");

?>