<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Feed extends Model
{
	protected $fillable = ['feed_name','feed_desc','url','favicon'];
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
		return $this->articles->where('status','unread')->count();
	}

	public function getReadCountAttribute()
	{
		return $this->articles->where('status','read')->count();
	}

	public function getTotalCountAttribute()
	{
		return $this->articles->count();
	}
}

?>
