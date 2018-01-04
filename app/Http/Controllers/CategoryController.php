<?php

namespace App\Http\Controllers;

use App\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
	public function index()
	{
		$Categories = Category::with('feeds')->orderBy('category_order', 'asc')->get();
		return response()->json($Categories);
	}

	public function overview()
	{
		$Categories = Category::with('feeds')->orderBy('category_order', 'asc')->get();
		return response()->json($Categories);
	}

	public function getCategory($id)
	{
		$Category = Category::with('feeds')->find($id);
		return response()->json($Category);
	}

	public function createCategory(Request $request)
	{
		$Category = Category::create($request->all());
		return response()->json($Category);
	}

	public function deleteCategory($id)
	{
		//do not delete feed if equal to 1 (Uncategorized)
		if ($id <> 1) {
			Category::where('id', $id)->delete();
			return response()->json('deleted');
		}
	}

	public function updateCategory(Request $request, $id)
	{
		$Category = Category::find($id);
		$Category->name = $request->input('name');
		$Category->save();
		return response()->json($Category);
	}

	public function updateorder(Request $request)
	{
		//check if url is set in POST argument, else exit
		if ($request->has('order')) {
			$orderArray = $request->input('order');
			foreach ($orderArray as $key => $value) {
				//update category with new order
				Category::where('id', $value)->update(['category_order' => $key]);
			}
		}
	}
}
