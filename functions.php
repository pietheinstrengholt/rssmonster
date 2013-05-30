<?php

// url variables

$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);
$jsonurl = $url . "/json.php";
$mobile = $url . "/mobile.php";

if (!function_exists('get_json')) {
function get_json($input)
	{

	// url variables

	$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
	$url = preg_replace('/\s+/', '', $url);
	$jsonurl = $url . "/json.php";

	// init json rpc

	$ch = curl_init();
	curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
	curl_setopt($ch, CURLOPT_POST, 1);
	curl_setopt($ch, CURLOPT_URL, $jsonurl);
	curl_setopt($ch, CURLOPT_POSTFIELDS, $input);
	return json_decode(curl_exec($ch) , true);
	}
}

if (!function_exists('in_multiarray')) {
function in_multiarray($elem, $array)
	{
	$top = sizeof($array) - 1;
	$bottom = 0;
	while ($bottom <= $top)
		{
		if ($array[$bottom] == $elem) return true;
		  else
		if (is_array($array[$bottom]))
		if (in_multiarray($elem, ($array[$bottom]))) return true;
		$bottom++;
		}

	return false;
	}
}

?>
