<?php

if(!$conn->query("DESCRIBE `feeds`")) {
    echo "Error: database table feeds doesnt exist<b>";
    exit;
}

if(!$conn->query("DESCRIBE `articles`")) {
    echo "Error: database table articles doesnt exist";
    exit;
}

function htmlallentities($str){
  $res = '';
  $strlen = strlen($str);
  for($i=0; $i<$strlen; $i++){
    $byte = ord($str[$i]);
    if($byte < 128) // 1-byte char
      $res .= $str[$i];
    elseif($byte < 192); // invalid utf8
    elseif($byte < 224) // 2-byte char
      $res .= '&#'.((63&$byte)*64 + (63&ord($str[++$i]))).';';
    elseif($byte < 240) // 3-byte char
      $res .= '&#'.((15&$byte)*4096 + (63&ord($str[++$i]))*64 + (63&ord($str[++$i]))).';';
    elseif($byte < 248) // 4-byte char
      $res .= '&#'.((15&$byte)*262144 + (63&ord($str[++$i]))*4096 + (63&ord($str[++$i]))*64 + (63&ord($str[++$i]))).';';
  }
  return $res;
}

// url variables
$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);
$jsonurl = $url . "/json.php";

/**
 * Format an interval to show all existing components.
 * If the interval doesn't have a time component (years, months, etc)
 * That component won't be displayed.
 *
 * @param DateInterval $interval The interval
 *
 * @return string Formatted interval string.
 */
function format_interval(DateInterval $interval) {
    $result = "";
    if ($interval->y) { $result .= $interval->format("%y years "); }
    if ($interval->m) { $result .= $interval->format("%m months "); }
    if ($interval->d) { $result .= $interval->format("%d days "); }
    if ($interval->h) { $result .= $interval->format("%h hours "); }
    if ($interval->i) { $result .= $interval->format("%i minutes "); }

    return $result;
}

if (!function_exists('get_json')) {
	function get_json($input) {

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
