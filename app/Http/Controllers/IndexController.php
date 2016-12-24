<?php

namespace App\Http\Controllers;
use App\Category;
use App\Feed;

class IndexController extends Controller
{
   public function index()
   {
      return view('index');
   }

   public function managefeeds()
   {
      $categories = Category::orderBy('name', 'asc')->get();
      $feeds = Feed::orderBy('feed_name', 'asc')->get();
      return view('managefeeds', compact('categories','feeds'));
   }

   public function newfeed()
   {
      return view('newfeed');
   }
}
