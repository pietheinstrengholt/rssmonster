<?php

//url variables
$url = 'http://'.$_SERVER['HTTP_HOST'].dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);
$jsonurl = $url . "/json.php";

function get_json($input)
{
  //url variables
  $url = 'http://'.$_SERVER['HTTP_HOST'].dirname($_SERVER['PHP_SELF']);
  $url = preg_replace('/\s+/', '', $url);
  $jsonurl = $url . "/json.php";

  //init json rpc
  $ch = curl_init();
  curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
  curl_setopt($ch, CURLOPT_POST, 1);
  curl_setopt($ch, CURLOPT_URL, $jsonurl);

  curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
  return json_decode(curl_exec($ch),true);
}

?>
