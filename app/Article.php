<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Article extends Model
{
	protected $fillable = ['status','subject','url','image_url','content','published'];
	protected $table = 'articles';

	public function feed()
	{
		return $this->belongsTo('App\Feed');
	}
}

?>
