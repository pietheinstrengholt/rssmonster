<?php

namespace App\Http\Controllers;

use DB;
use App\Article;
use App\Category;
use App\Feed;
use App\Http\Controllers\Controller;
//use SimplePie to parse RSS feeds, see: https://github.com/arandilopez/laravel-feed-parser
use ArandiLopez\Feed\Factories\FeedFactory;
use Illuminate\Http\Request;

class FeedController extends Controller{

	protected $feedFactory;

	public function index() {
		$Feeds = DB::table('feeds')->join('categories', 'feeds.category_id', '=', 'categories.id')->orderBy('feed_name', 'asc')->select('feeds.id','feeds.category_id','feeds.feed_name','feeds.feed_desc','feeds.url','feeds.favicon','categories.name as category_name')->get();
		return response()->json($Feeds);
	}

	public function updateall() {

		//get only 15 feeds at a time
		$Feeds = Feed::orderBy('updated_at', 'asc')->take(15)->get();

		if (!empty($Feeds)) {
			foreach ($Feeds as $Feed) {
				//update feed, see update function
				$this->update($Feed->id);
				
			}
		}
		
	}
	
	public function update($id) {
	
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

	public function newrssfeed() {
	
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

	public function getFeed($id) {
		$Feed = Feed::find($id);
		if (!empty($Feed)) {
			$Feed['total_count'] = DB::table('articles')->where('feed_id', $id)->count();
			$Feed['unread_count'] = DB::table('articles')->where('feed_id', $id)->where('articles.status', 'unread')->count();			
			$Feed['articles']  = Feed::find($id)->articles;
		}
		return response()->json($Feed);
	}
	
	public function changecategory() {
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

	public function changeall() {
	
		if (!empty($_POST['feeds'])) {
			foreach ($_POST['feeds'] as $feed) {
				if (isset($feed['delete'])) {
					$Feed = Feed::find($feed['feed_id']);
					Article::where('feed_id',$feed['feed_id'])->delete();
					Feed::where('id',$feed['feed_id'])->delete();
				} else {
					Feed::where('id', $feed['feed_id'])->update(['feed_name' => $feed['feed_name']],['category_id' => $feed['category_id']]);
				}
			}
			echo "done";
		}
	}

	public function createFeed(Request $request) {
		$Feed = Feed::create($request->all());
		return response()->json($Feed);
	}

	public function deleteFeed($id) {
		$Feed = Feed::find($id);
		Article::where('feed_id',$id)->delete();
		Feed::where('id',$id)->delete();
		return response()->json('deleted');
	}

	public function updateFeed(Request $request,$id) {
		$Feed = Feed::find($id);
		$Feed->name = $request->input('name');
		$Feed->save();
		return response()->json($Feed);
	}
	
	//TODO: Re-use functions from other classes
	public function fever() {

		//static for now
		$email  = 'username';
		$pass   = 'password';
		$api_key = md5($email.':'.$pass);
		
		//always return status 1: password and username correct
		$status = "1";
		
		//latest api version is 3
		$arr = array("api_version" => "3", "auth" => $status);
		
		//last refreshed is current system time
		$time = array("last_refreshed_on_time" => strtotime("now"));
		$arr = array_merge($arr, $time);
		
		//when argument is groups, retrieve list with categories and id's
		if (isset($_GET['groups'])) {
			$groups = array();
			$Categories = Category::orderBy('category_order', 'asc')->get();
			if (!empty($Categories)) {
				foreach($Categories as $Category) {
					array_push($groups, array(
						"id" => $Category->id,
						"title" => $Category->name
					));
				}
			}
			$response_arr["groups"] = $groups;
			$arr = array_merge($arr, $response_arr);
		};
		//when argument is feeds, retrieve list with feeds and id's
		if (isset($_GET['feeds'])) {
			$feeds = array();
			$Feeds = Feed::orderBy('feed_name', 'asc')->get();
			if (!empty($Feeds)) {
				foreach($Feeds as $Feed) {
					array_push($feeds, array(
						"id"  => $Feed->id,
						"favicon_id" => $Feed->id,
						"title" => $Feed->feed_name,
						"url" => $Feed->url,
						"site_url" => $Feed->url,
						"is_spark" => "0",
						"last_updated_on_time" => strtotime($Feed->updated_at)
					));
				}
			}
			$response_arr["feeds"] = $feeds;
			$arr = array_merge($arr, $response_arr);
		};
		//when argument is groups or feeds, return feed id's linked to category id's
		if (isset($_GET['groups']) || isset($_GET['feeds'])) {
			$feeds_groups = array();
			$Feeds = DB::table('feeds')->join('categories', 'feeds.category_id', '=', 'categories.id')->orderBy('feed_name', 'asc')->select('feeds.id','feeds.category_id')->get();
			if (!empty($Feeds)) {
				foreach($Feeds as $Feed) {
					array_push($feeds_groups, array(
						"group_id" => $Feed->category_id,
						"feed_ids" => $Feed->id
					));
				}
			}
			$response_arr["feeds_groups"] = $feeds_groups;
			$arr = array_merge($arr, $response_arr);
		};
		//return list with all unread article id's
		if (isset($_GET['unread_item_ids'])) {
			$unread_item_ids = array();
			$Articles = Article::where('status', 'unread')->orderBy('id', 'asc')->get();
			if (!empty($Articles)) {
				foreach($Articles as $Article) {
					array_push($unread_item_ids, $Article->id);
				}
			}
			//string/comma-separated list of positive integers instead of array
			$stack = implode(',', $unread_item_ids);
			$unreaditems = array("unread_item_ids" => $stack);
			$arr = array_merge($arr, $unreaditems);
		};
		//when argument is items, return 50 articles at a time
		if (isset($_GET['items'])) {
			//request specific items, a maximum of 50 specific items requested by comma-separated argument
			if (isset($_GET['with_ids'])) {
				//list with id's is comma-separated, so transform to array
				$ids = $_REQUEST["with_ids"];
				$ArrayIds = explode(',', $ids);
				
				$items = array();

				if (!empty($ArrayIds)) {
					foreach($ArrayIds as $ArrayId) {
						$Article = Article::find($ArrayId);
						
						if ($Article->status == "read") { 
							$isread = '1'; 
							$isstar = '0'; } 
						elseif ($Article->status == "unread") { 
							$isread = '0'; 
							$isstar = '0'; } 
						elseif ($Article->status == "star") { 
							$isread = '0'; 
							$isstar = '1'; 
						}
						array_push($items, array(
							"id" => $Article->id,
							"feed_id" => $Article->feed_id,
							"title" => $Article->subject,
							"author" => $Article->author,
							"html" => $Article->content,
							"url" => $Article->url,
							"is_saved" => $isstar,
							"is_read" => $isread,
							"created_on_time" => strtotime($Article->published)
						));
						
					}
				}

				$response_arr["items"] = $items;
				$arr = array_merge($arr, $response_arr);
			//request 50 additional items using the highest id of locally cached items
			} elseif (isset($_REQUEST["since_id"])) {
				$since_id = $_REQUEST["since_id"];
				$items = array();
				$Articles = Article::where('id', '>' , $since_id)->take(50)->get();
				if (!empty($Articles)) {
					foreach($Articles as $Article) {
						if ($Article->status == "read") { 
							$isread = '1'; 
							$isstar = '0'; } 
						elseif ($Article->status == "unread") { 
							$isread = '0'; 
							$isstar = '0'; } 
						elseif ($Article->status == "star") { 
							$isread = '0'; 
							$isstar = '1'; 
						}
						array_push($items, array(
							"id" => $Article->id,
							"feed_id" => $Article->feed_id,
							"title" => $Article->subject,
							"author" => $Article->author,
							"html" => $Article->content,
							"url" => $Article->url,
							"is_saved" => $isstar,
							"is_read" => $isread,
							"created_on_time" => strtotime($Article->published)
						));
					}
				}
				$response_arr["items"] = $items;
				$arr = array_merge($arr, $response_arr);
			//request 50 previous items using the lowest id of locally cached items
			} elseif (isset($_REQUEST["max_id"])) {
				$max_id = $_REQUEST["max_id"];
				$items = array();
				$Articles = Article::where('id', '<' , $max_id)->take(50)->get();
				if (!empty($Articles)) {
					foreach($Articles as $Article) {
						if ($Article->status == "read") { 
							$isread = '1'; 
							$isstar = '0'; } 
						elseif ($Article->status == "unread") { 
							$isread = '0'; 
							$isstar = '0'; } 
						elseif ($Article->status == "star") { 
							$isread = '0'; 
							$isstar = '1'; 
						}
						array_push($items, array(
							"id" => $Article->id,
							"feed_id" => $Article->feed_id,
							"title" => $Article->subject,
							"author" => $Article->author,
							"html" => $Article->content,
							"url" => $Article->url,
							"is_saved" => $isstar,
							"is_read" => $isread,
							"created_on_time" => strtotime($Article->published)
						));
					}
				}
				$response_arr["items"] = $items;
				$arr = array_merge($arr, $response_arr);
			//if no argument is given provide total_items and up to 50 items
			} else {
			
				$total_items = array();
				$total_items['total_items'] = Article::count();					
				$arr = array_merge($arr, $total_items);
				$items = array();
				
				$Articles = Article::take(50)->get();
				if (!empty($Articles)) {
					foreach($Articles as $Article) {
						if ($Article->status == "read") { 
							$isread = '1'; 
							$isstar = '0'; } 
						elseif ($Article->status == "unread") { 
							$isread = '0'; 
							$isstar = '0'; } 
						elseif ($Article->status == "star") { 
							$isread = '0'; 
							$isstar = '1'; 
						}
						array_push($items, array(
							"id" => $Article->id,
							"feed_id" => $Article->feed_id,
							"title" => $Article->subject,
							"author" => $Article->author,
							"html" => $Article->content,
							"url" => $Article->url,
							"is_saved" => $isstar,
							"is_read" => $isread,
							"created_on_time" => strtotime($Article->published)
						));
					}
				}
				
				$response_arr["items"] = $items;
				$arr = array_merge($arr, $response_arr);
				
			}
		};
		//return string/comma-separated list with id's from read articles
		if (isset($_GET['saved_item_ids'])) {
			$saved_item_ids = array();
			$Articles = Article::where('status', 'read')->orderBy('id', 'asc')->get();
			if (!empty($Articles)) {
				foreach($Articles as $Article) {
					array_push($saved_item_ids, $Article->id);
				}
			}
			//string/comma-separated list of positive integers instead of array
			$stack = implode(',', $saved_item_ids);
			$readitems = array("saved_item_ids" => $stack);
			$arr = array_merge($arr, $readitems);
		};
		if (isset($_GET['links'])) {
			$links = array();
			$response_arr["links"] = $links;
			$arr = array_merge($arr, $response_arr);
		};
		//when argument is groups, retrieve list with categories and id's
		if (isset($_GET['favicons'])) {
			$favicons = array();
			$Feeds = Feed::orderBy('feed_name', 'asc')->get();
			if (!empty($Feeds)) {
				foreach($Feeds as $Feed) {
				
					if (empty($Feed->favicon)) {
						//TODO: replace with Laravel URL functionality
						$faviconurl = (isset($_SERVER['HTTPS']) ? "https" : "http") . "://" . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
						$faviconurl = substr($faviconurl, 0, strpos($faviconurl, "index.php/api")) . "img/rss-default.png";
					} else {
						$faviconurl = $Feed->favicon;
					}
				
					array_push($favicons, array(
						"id" => $Feed->id,
						"title" => $faviconurl
					));
				}
				$response_arr["favicons"] = $favicons;
				$arr = array_merge($arr, $response_arr);		
			}
		};
		return response()->json($arr);

		//mark items, groups or feed as read, saved or unsaved
		if (isset($_POST['mark'])) {
			if (isset($_POST['before'])) { $time = date("Y-m-d H:i:s",$_POST['before']); } else { $time = time(); }
			if ($_REQUEST["mark"] == "item") {
				$id = $_REQUEST["id"];
				if ($_REQUEST["as"] == "read") {
					Article::where('id', $id)->update(['status' => 'read']);
				} elseif ($_REQUEST["as"] == "saved") {
					Article::where('id', $id)->update(['status' => 'star']);
				} elseif ($_REQUEST["as"] == "unsaved") {
					Article::where('id', $id)->update(['status' => 'unread']);
				}
			}
			//feeds
			if ($_REQUEST["mark"] == "feed") {
				$id = $_REQUEST["id"];
				if ($_REQUEST["as"] == "read") {
					Article::where('feed_id', $id)->where('created_at', '<' , $time)->update(['status' => 'read']);
				} elseif ($_REQUEST["as"] == "saved") {
					Article::where('feed_id', $id)->where('created_at', '<' , $time)->update(['status' => 'star']);
				} elseif ($_REQUEST["as"] == "unsaved") {
					Article::where('feed_id', $id)->where('created_at', '<' , $time)->update(['status' => 'unread']);
				}
			}
			//a group should be specified with an id not equal to zero
			if ($_REQUEST["mark"] == "group" && $_REQUEST["id"] != "0") {
				
				//get feeds based on category_id
				$id = $_REQUEST["id"];
				$Feeds = Category::find($id)->feeds;
				
				if (!empty($Feeds)) {
					foreach($Feeds as $Feed) {
						if ($_REQUEST["as"] == "read") {
							Article::where('feed_id', $Feed->id)->where('created_at', '<' , $time)->update(['status' => 'read']);
						} elseif ($_REQUEST["as"] == "saved") {
							Article::where('feed_id', $Feed->id)->where('created_at', '<' , $time)->update(['status' => 'star']);
						} elseif ($_REQUEST["as"] == "unsaved") {
							Article::where('feed_id', $Feed->id)->where('created_at', '<' , $time)->update(['status' => 'unread']);
						}
					}
				}
			}
			//this is "all" according fever
			if ($_REQUEST["mark"] == "group" && $_REQUEST["id"] == "0") {
				if ($_REQUEST["as"] == "read") {
					Article::where('created_at', '<' , $time)->update(['status' => 'read']);
				} elseif ($_REQUEST["as"] == "saved") {
					Article::where('created_at', '<' , $time)->update(['status' => 'star']);
				} elseif ($_REQUEST["as"] == "unsaved") {
					Article::where('created_at', '<' , $time)->update(['status' => 'unread']);
				}
			}
		}
	
	
	}	

}
