<?php

namespace App\Http\Controllers;

use DB;
use App\Article;
use App\Category;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class ArticleController extends Controller{

	public function index() {
		$Articles  = Article::all();
		return response()->json($Articles);
	}
	
	public function listing() {
	
		//check if status argument is set
		if (!isset($_GET['status'])) {
			exit();
		}
	
		$unread_item_ids = array();
		
		//get articles for status equals read and unread
		if ($_GET['status'] != 'star') {
			if (!empty($_GET['feed_id'])) {
				$Articles = Article::where('feed_id', $_GET['feed_id'])->where('status', $_GET['status'])->orderBy('published', $_GET['sort'])->select('id')->get();
			} else if (!empty($_GET['category_id'])) {
				$Articles = DB::table('categories')->join('feeds', 'categories.id', '=', 'feeds.category_id')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('categories.id', $_GET['category_id'])->where('articles.status', $_GET['status'])->orderBy('published', $_GET['sort'])->select('articles.id')->get();
			} else {
				$Articles  = Article::where('status', $_GET['status'])->orderBy('published', $_GET['sort'])->select('id')->get();
			}
		}
		
		//get articles for status star, star_ind equals one
		if ($_GET['status'] == 'star') {
			if (!empty($_GET['feed_id'])) {
				$Articles = Article::where('feed_id', $_GET['feed_id'])->where('star_ind', '1')->orderBy('published', $_GET['sort'])->select('id')->get();
			} else if (!empty($_GET['category_id'])) {
				$Articles = DB::table('categories')->join('feeds', 'categories.id', '=', 'feeds.category_id')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('categories.id', $_GET['category_id'])->where('articles.star_ind', '1')->orderBy('published', $_GET['sort'])->select('articles.id')->get();
			} else {
				$Articles  = Article::where('star_ind', '1')->orderBy('published', $_GET['sort'])->select('id')->get();
			}
		}
		
		//if not empty restructure array with article id's
		if (!empty($Articles)) {
			foreach($Articles as $Article) {
				array_push($unread_item_ids, $Article->id);
			}
		}
		
		//return comma separated string with article id's
		return response()->json($unread_item_ids);
	}
	
	//return article content, based on article_id argument
	public function details() {
		if (!empty($_GET['article_id'])) {
			$articlelist = explode(',', $_GET['article_id']);
			$Articles  = DB::table('articles')->join('feeds', 'articles.feed_id', '=', 'feeds.id')->whereIn('articles.id', $articlelist)->orderBy('published', $_GET['sort'])->select('articles.id','articles.status','articles.star_ind','articles.url','articles.subject','articles.content','articles.published','articles.feed_id','feeds.feed_name')->get();
			return response()->json($Articles);
		}
	}	

	//return array with the count of each status
	public function overview() {
		$Articles = array();
		$Articles['total'] = Article::count();
		$Articles['star'] = Article::where('star_ind', '1')->count();
		$Articles['read'] = Article::where('status', 'read')->count();
		$Articles['unread'] = Article::where('status', 'unread')->count();
		return response()->json($Articles);
	}

	public function getArticle($id) {
		$Article = Article::find($id);
		return response()->json($Article);
	}

	public function createArticle(Request $request) {
		$Article = Article::create($request->all());
		return response()->json($Article);
	}
	
	public function marktoread($id) {
		$Article = Article::find($id);
		if ($Article->status == "unread") {
			Article::where('id', $id)->update(['status' => 'read']);
			$Article = Article::find($id);
			$Article->category_id = DB::table('articles')->join('feeds', 'articles.feed_id', '=', 'feeds.id')->where('articles.id', $id)->max('feeds.category_id');
			return response()->json($Article);
		}
	}
	
	public function marktounread($id) {
		$Article = Article::find($id);
		if ($Article->status == "read") {
			Article::where('id', $id)->update(['status' => 'unread']);
			$Article = Article::find($id);
			$Article->category_id = DB::table('articles')->join('feeds', 'articles.feed_id', '=', 'feeds.id')->where('articles.id', $id)->max('feeds.category_id');
			return response()->json($Article);
		}
	}	
	
	public function markwithstar($id) {
		
		if ($_POST['update'] == "mark") {
			Article::where('id', $id)->update(['star_ind' => '1']);
			return response()->json('set to star');
		}
		
		if ($_POST['update'] == "unmark") {
			Article::where('id', $id)->update(['star_ind' => '0']);
			return response()->json('set to read');
		}		
		
	}
	
	public function markallasread() {
		if ($_POST['update'] == "mark-all-as-read") {
			Article::where('status', 'unread')->update(['status' => 'read']);
			return response()->json('marked all as read');
		}
	}	

	public function deleteArticle($id) {
		$Article = Article::find($id);
		$Article->delete();
		return response()->json('deleted');
	}

	public function updateArticle(Request $request,$id) {
		$Article = Article::find($id);
		$Article->name = $request->input('name');
		$Article->save();
		return response()->json($Article);
	}

}

