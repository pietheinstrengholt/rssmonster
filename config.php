<?php

//error_reporting(E_ERROR | E_WARNING | E_PARSE | E_NOTICE);

// Connection's Parameters
$db_host="localhost";
$db_name="openreader";
$username="openreader";
$password="openreader";

mysql_connect($db_host, $username, $password) or die(mysql_error());
mysql_select_db($db_name) or die(mysql_error());

?>
