<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Feed extends Model
{
	protected $fillable = ['feed_name', 'feed_desc', 'url', 'favicon'];
	protected $table = 'feeds';
	protected $appends = array('unread_count', 'read_count', 'total_count', 'star_count');

	public function category()
	{
		return $this->belongsTo('App\Category');
	}

	public function articles()
	{
		return $this->hasMany('App\Article');
	}

	public function getUnreadCountAttribute()
	{
		return Article::where('feed_id', $this->attributes['id'])->where('status', 'unread')->count();
	}

	public function getReadCountAttribute()
	{
		return Article::where('feed_id', $this->attributes['id'])->where('status', 'read')->count();
	}

	public function getTotalCountAttribute()
	{
		return Article::where('feed_id', $this->attributes['id'])->count();
	}

	public function getStarCountAttribute()
	{
		return Article::where('feed_id', $this->attributes['id'])->where('star_ind', 1)->count();
	}
}