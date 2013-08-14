<?php

if(!$conn->query("DESCRIBE `feeds`")) {
    echo "Error: database table feeds doesnt exist<b>";
    exit;
}

if(!$conn->query("DESCRIBE `articles`")) {
    echo "Error: database table articles doesnt exist";
    exit;
}

// url variables
$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);
$jsonurl = $url . "/json.php";

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

if (!function_exists('in_array_r')) {
function in_array_r($needle, $haystack, $strict = false) {
    foreach ($haystack as $item) {
        if (($strict ? $item === $needle : $item == $needle) || (is_array($item) && in_array_r($needle, $item, $strict))) {
            return true;
        }
    }

    return false;
}
}

?>
