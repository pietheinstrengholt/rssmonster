<?php

include 'config.php';
include 'functions.php';

//init json rpc
$ch = curl_init();
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, 1);
curl_setopt($ch, CURLOPT_URL, $jsonurl);

$data = '{"jsonrpc": "2.0", "request": "overview-categories"}';
curl_setopt($ch, CURLOPT_POSTFIELDS, $data);
$array = json_decode(curl_exec($ch),true);

echo "<pre>";
print_r($array);
echo "</pre>";

?>
