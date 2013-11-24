<?php

//error_reporting(E_ERROR | E_WARNING | E_PARSE | E_NOTICE);

// Connection's Parameters
$db_host="localhost";
$db_name="phppaper";
$username="admin";
$password="admin";

//mysql_connect($db_host, $username, $password) or die(mysql_error());
//mysql_select_db($db_name) or die(mysql_error());

//$conn = new PDO('mysql:host=$db_host;dbname=$db_name', $username, $password);
//$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

$conn = new PDO('mysql:host=localhost;dbname=openreaderst;charset=utf8', $username, $password);
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

error_reporting(E_ALL);
ini_set('display_errors', 'On');

?>
