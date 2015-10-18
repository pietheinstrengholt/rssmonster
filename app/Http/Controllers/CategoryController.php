<?php
  
namespace App\Http\Controllers;

use DB;
use App\Category;
use App\Http\Controllers\Controller;
use Illuminate\Http\Request;

class CategoryController extends Controller{

	public function index(){
		$Categories = Category::orderBy('category_order', 'asc')->get();
		return response()->json($Categories);
	}
	
	public function overview(){
		$newArray = array();
		$Categories = Category::orderBy('category_order', 'asc')->get();
		if (!empty($Categories)) {
			foreach($Categories as $key => $Category) {
				$newArray[$key] = $Category;
				$newArray[$key]['unread_count'] = $Category['unread_count'] = DB::table('feeds')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('feeds.category_id', $Category['id'])->where('articles.status', 'unread')->count();
				$newArray[$key]['feeds'] = Category::find($Category['id'])->feeds;
				if (!empty($newArray[$key]['feeds'])) {
					foreach($newArray[$key]['feeds'] as $feedkey => $feed) {
						$newArray[$key]['feeds'][$feedkey]['unread_count'] = DB::table('articles')->where('feed_id', $feed['id'])->where('status', 'unread')->count();			
					}
				}
			}
		}
		return response()->json($newArray);
	}

	public function getCategory($id){
		$Category = Category::find($id);
		if (!empty($Category)) {
			$Category['total_count'] = DB::table('feeds')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('feeds.category_id', $id)->count();
			$Category['unread_count'] = DB::table('feeds')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('feeds.category_id', $id)->where('articles.status', 'unread')->count();
			$Category['feeds'] = Category::find($id)->feeds;
			if (!empty($Category['feeds'])) {
				foreach($Category['feeds'] as $key => $feed) {
					$Category['feeds'][$key]['unread_count'] = DB::table('articles')->where('feed_id', $feed['id'])->where('status', 'unread')->count();			
				}
			}
			
		}
		return response()->json($Category);
	}

	public function createCategory(Request $request){
		$Category = Category::create($request->all());
		return response()->json($Category);
	}

	public function deleteCategory($id){
		$Category = Category::find($id);
		$Category->delete();
		return response()->json('deleted');
	}

	public function updateCategory(Request $request,$id){
		$Category = Category::find($id);
		$Category->name = $request->input('name');
		$Category->save();
		return response()->json($Category);
	}
	
	public function updateorder(){
		//check if url is set in POST argument, else exit
		if (!isset($_POST['order'])) {
			exit();
		}
		
		$orderArray = $_POST['order'];
		foreach ($orderArray as $key => $value) {
			//update category with new order
			Category::where('id', $value)->update(['category_order' => $key]);		
		}
		
	}		
  
}
