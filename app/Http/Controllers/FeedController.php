<?php

namespace App\Http\Controllers;

use DB;
use App\Article;
use App\Feed;
use App\Http\Controllers\Controller;
//use SimplePie to parse RSS feeds, see: https://github.com/arandilopez/laravel-feed-parser
use ArandiLopez\Feed\Factories\FeedFactory;
use Illuminate\Http\Request;

class FeedController extends Controller{

	protected $feedFactory;

	public function index(){
		$Feeds = DB::table('feeds')->join('categories', 'feeds.category_id', '=', 'categories.id')->orderBy('feed_name', 'asc')->select('feeds.id','feeds.category_id','feeds.feed_name','feeds.feed_desc','feeds.url','feeds.favicon','categories.name as category_name')->get();
		return response()->json($Feeds);
	}

	public function updateall(){

		//get only 15 feeds at a time
		$Feeds  = Feed::orderBy('updated_at', 'asc')->take(15)->get();

		if (!empty($Feeds)) {
			foreach ($Feeds as $Feed) {
				//update feed, see update function
				$this->update($Feed->id);
				
			}
		}
		
	}
	
	public function update($id){
	
		//set previous week
		$previousweek = date('Y-m-j H:i:s', strtotime('-7 days'));	

		$Feed = Feed::find($id);
		echo $Feed->url . "<br>";
		$feedFactory = new FeedFactory(['cache.enabled' => false]);
		$feeder = $feedFactory->make($Feed->url);
		$simplePieInstance = $feeder->getRawFeederObject();
		
		//only add articles and update feed when results are found
		if (!empty($simplePieInstance)) {
		
			foreach ($simplePieInstance->get_items() as $item) {

				$matchThese = ['feed_id' => $Feed->id, 'url' => $item->get_permalink()];

				$results = Article::where($matchThese)->count();
				$date    = $item->get_date('Y-m-j H:i:s');

				if ($results == 0 && !(strtotime($date) < strtotime($previousweek))) {

					$article = new Article;
					$article->feed_id = $Feed->id;
					$article->status = 'unread';
					$article->url = $item->get_permalink();
					$article->subject = $item->get_title();
					$article->content = $item->get_description();
					$article->published = $item->get_date('Y-m-j H:i:s');
					$article->save();

					echo "- " . $item->get_title() . "<br>";

				}
			}
				
			//update feed updated_at record
			Feed::where('id', $Feed->id)->update(['updated_at' => date('Y-m-j H:i:s')]);
			Feed::where('id', $Feed->id)->update(['feed_desc' => $simplePieInstance->get_description()]);
			Feed::where('id', $Feed->id)->update(['favicon' => $simplePieInstance->get_image_url()]);
		}
	}

	public function newrssfeed(){
	
		//check if url is set in POST argument, else exit
		if (!isset($_POST['url'])) {
			exit();
		}
		
		//check if url is valid
		if (filter_var($_POST['url'], FILTER_VALIDATE_URL) === FALSE) {
			exit();
		}
		
		$feedFactory = new FeedFactory(['cache.enabled' => false]);
		$feeder = $feedFactory->make($_POST['url']);
		$simplePieInstance = $feeder->getRawFeederObject();

		if (!empty($simplePieInstance)) {
		
			echo $simplePieInstance->get_title() . "<br>";
			echo $simplePieInstance->get_description() . "<br>";
			echo $simplePieInstance->get_permalink() . "<br>";
			//favicon has been deprecated: $simplePieInstance->get_favicon();
			
			$Result = Feed::where('url', $simplePieInstance->get_permalink())->first();
			
			if (!empty($Result)) {
				echo "<br>Feed already exists!";
			} else {
				$feed = new Feed;
				$feed->category_id = '1';
				$feed->feed_name = $simplePieInstance->get_title();
				$feed->feed_desc = $simplePieInstance->get_description();
				$feed->url = $simplePieInstance->get_permalink();
				$feed->favicon = $simplePieInstance->get_image_url();
				$feed->save();
				echo "<br>Feed added to the database!";
			}
		}
	}	

	public function getFeed($id){
		$Feed = Feed::find($id);
		if (!empty($Feed)) {
			$Feed['total_count'] = DB::table('articles')->where('feed_id', $id)->count();
			$Feed['unread_count'] = DB::table('articles')->where('feed_id', $id)->where('articles.status', 'unread')->count();			
			$Feed['articles']  = Feed::find($id)->articles;
		}
		return response()->json($Feed);
	}
	
	public function changecategory(){
		//check if url is set in POST argument, else exit
		if (!isset($_POST['category_id'])) {
			exit();
		}
		
		if (!isset($_POST['feed_id'])) {
			exit();
		}
		
		//update feed with new category_id
		Feed::where('id', $_POST['feed_id'])->update(['category_id' => $_POST['category_id']]);
		
	}	

	public function createFeed(Request $request){
		$Feed = Feed::create($request->all());
		return response()->json($Feed);
	}

	public function deleteFeed($id){
		$Feed = Feed::find($id);
		Article::where('feed_id',$id)->delete();
		Feed::where('id',$id)->delete();
		return response()->json('deleted');
	}

	public function updateFeed(Request $request,$id){
		$Feed = Feed::find($id);
		$Feed->name = $request->input('name');
		$Feed->save();
		return response()->json($Feed);
	}

}
