<?php

namespace App;
use App\Setting;

class Helper {

	/**
	 * @param string $input
	 */
	public static function setting($input) {
		$setting = Setting::where('config_key', $input)->first();
		if ($input == 'sort_order' && empty($setting)) {
			return 'desc';
		}
		if (!empty($setting)) {
			return $setting->config_value;
		}
	}
}

?>
