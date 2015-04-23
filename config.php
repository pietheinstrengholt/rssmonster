<?php

// Connection's Parameters
$db_host="localhost";
$db_name="phppaper";
$username="username";
$password="password";
$db_path="/var/www/cache";

$conn = new PDO('mysql:$db_host;$db_name;charset=utf8', $username, $password);
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

error_reporting(E_ALL);
ini_set('display_errors', 'On');

?>
