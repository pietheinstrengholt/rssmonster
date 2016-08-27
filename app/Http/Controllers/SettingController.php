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
		//validate input form
		$this->validate($request, [
			'sort_order' => 'required',
		]);

		//truncate table
		Setting::truncate();

		$setting = new Setting;
		$setting->config_key = 'sort_order';
		$setting->config_value = $request->input('sort_order');
		$setting->save();

		return Redirect::to('/');
	}
}
