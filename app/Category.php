<?php

namespace App;

use Illuminate\Database\Eloquent\Model;
use DB;

class Category extends Model
{
	protected $fillable = ['name'];
	protected $table = 'categories';
	protected $appends = array('unread_count', 'read_count', 'total_count');

	public function feeds()
	{
		return $this->hasMany('App\Feed')->orderBy('feed_name');
	}

	public function getUnreadCountAttribute()
	{
		return DB::table('feeds')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('feeds.category_id', $this->id)->where('articles.status', 'unread')->count();
	}

	public function getReadCountAttribute()
	{
		return DB::table('feeds')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('feeds.category_id', $this->id)->where('articles.status', 'unread')->count();
	}

	public function getTotalCountAttribute()
	{
		return DB::table('feeds')->join('articles', 'feeds.id', '=', 'articles.feed_id')->where('feeds.category_id', $this->id)->count();
	}
}

?>
