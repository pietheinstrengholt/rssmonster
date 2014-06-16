<?php

// Connection's Parameters
$db_host="localhost";
$db_name="openreader";
$username="admin";
$password="apple200";

$conn = new PDO('mysql:host=localhost;dbname=openreaderst;charset=utf8', $username, $password);
$conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
$conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);

error_reporting(E_ALL);
ini_set('display_errors', 'On');

?>
