<?php

namespace App\Http\Controllers;

use Illuminate\Html\HtmlFacade;
use Illuminate\Html\HtmlServiceProvider;
use Illuminate\Routing\UrlGenerator;

class IndexController extends Controller{

	public function index(){
		return view('index');
	}
	
	public function managefeeds(){
		return view('managefeeds');
	}	

}

