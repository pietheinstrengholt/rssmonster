<?php

// Cache location for SimplePie
$db_path="/var/www/cache";

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

// Connection's Parameters
define("DB_HOST", "localhost");
define("DB_USER", "username");
define("DB_PASS", "password");
define("DB_NAME", "database");

// Enable transactional commits
define("DB_TRANS", "1;");

error_reporting(E_ALL);
ini_set('display_errors', 'On');

?>
