<?php

namespace App\Http\Controllers;

//initialize Agent, to detect mobile, tablet or desktop, see; https://github.com/jenssegers/agent 
use Jenssegers\Agent\Agent;
use Illuminate\Html\HtmlFacade;
use Illuminate\Html\HtmlServiceProvider;
use Illuminate\Routing\UrlGenerator;

class IndexController extends Controller{

	public function index(){

		$agent = new Agent();

		if ($agent->isMobile()) {
			$data = "mobile";
		} else if ($agent->isTablet()) {
			$data = "tablet";		
		} else {
			$data = "destop";
		}

		return view('index', ['format' => $data]);
	}
	
	public function managefeeds(){
		return view('managefeeds');
	}	

}

