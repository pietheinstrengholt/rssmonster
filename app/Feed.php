<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Feed extends Model
{
	protected $fillable = ['feed_name', 'feed_desc', 'url', 'favicon'];
	protected $table = 'feeds';
	protected $appends = array('unread_count', 'read_count', 'total_count');

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
		return $this->withCount('articles')->where('status','unread');
	}

	public function getReadCountAttribute()
	{
		return $this->withCount('articles')->where('status','read');
	}

	public function getTotalCountAttribute()
	{
		return $this->withCount('articles');
	}
}

?>
