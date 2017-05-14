<?php

namespace App\Http\Controllers;
use App\Setting;
use Illuminate\Http\Request;

class SettingController extends Controller
{

	public function index()
	{
		//rotate array in order to process it better
		$config_array = array();

  		$settings = Setting::orderBy('config_key', 'asc')->get();

		if (!empty($settings)) {
			foreach($settings as $setting) {
				$config_key = $setting['config_key'];
				$config_array[$config_key] = $setting['config_value'];
			}
		}

  		return view('settings', compact('config_array'));
	}

	public function store(Request $request)
	{
	  if ($request->isMethod('post')) {
		 if ($request->has('settings')) {
		 	//truncate table
		 	Setting::truncate();

			foreach ($request->input('settings') as $key => $value) {
				$setting = new Setting;
				$setting->config_key = $key;
				$setting->config_value = $value;
				$setting->save();
			}

	  		return response()->json("done");
		 }
	  }
	}
}
