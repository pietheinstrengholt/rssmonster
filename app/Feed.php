<?php

namespace App;

use Illuminate\Database\Eloquent\Model;

class Feed extends Model
{
   protected $fillable = ['feed_name','feed_desc','url','favicon'];
   protected $table = 'feeds';

   public function category()
   {
      return $this->belongsTo('App\Category');
   }

   public function articles()
   {
      return $this->hasMany('App\Article');
   }
}

?>
