<?php

/**
 * functions.php
 *
 * The functions.php includes all frequently
 * used functions.
 *
 */

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
if (!function_exists('format_interval')) {
	function format_interval(DateInterval $interval) {
		$result = "";
		if ($interval->y) { $result .= $interval->format("%y years "); }
		if ($interval->m) { $result .= $interval->format("%m months "); }
		if ($interval->d) { $result .= $interval->format("%d days "); }
		if ($interval->h) { $result .= $interval->format("%h hours "); }
		if ($interval->i) { $result .= $interval->format("%i minutes "); }
		return $result;
	}
}

if (!function_exists('get_json')) {
	function get_json($input) {
		// url variables
		global $url;
		global $jsonurl;

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

if (!function_exists('mysql_escape_mimic')) {
	function mysql_escape_mimic($inp) {
		if(is_array($inp)) {
			return array_map(__METHOD__, $inp);
		}

		if(!empty($inp) && is_string($inp)) {
			return str_replace(array('\\', "\0", "\n", "\r", "'", '"', "\x1a"), array('\\\\', '\\0', '\\n', '\\r', "\\'", '\\"', '\\Z'), $inp);
		}

		return $inp;
	}
}

?>
