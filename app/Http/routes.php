<?php

/*
|--------------------------------------------------------------------------
| Application Routes
|--------------------------------------------------------------------------
|
| Here is where you can register all of the routes for an application.
| It is a breeze. Simply tell Lumen the URIs it should respond to
| and give it the Closure to call when that URI is requested.
|
*/

$app->get('/','IndexController@index');
$app->get('/managefeeds','IndexController@managefeeds');

$app->get('/api/category','CategoryController@index');
$app->get('/api/category/overview','CategoryController@overview');
$app->get('/api/category/{id}','CategoryController@getcategory');
$app->post('/api/category','CategoryController@createcategory');
$app->post('/api/category/updateorder','CategoryController@updateorder');
$app->put('/api/category/{id}','CategoryController@updatecategory');
$app->delete('/api/category/{id}','CategoryController@deletecategory');

$app->get('/api/feed','FeedController@index');
$app->get('/api/feed/updateall','FeedController@updateall');
$app->get('/api/feed/update','FeedController@update');
$app->get('/api/feed/{id}','FeedController@getfeed');
$app->post('/api/feed','FeedController@createfeed');
$app->post('/api/feed/newrssfeed','FeedController@newrssfeed');
$app->post('/api/feed/changecategory','FeedController@changecategory');
$app->put('/api/feed/{id}','FeedController@updatefeed');
$app->delete('/api/feed/{id}','FeedController@deletefeed');

$app->get('/api/article','ArticleController@index');
$app->get('/api/article/overview','ArticleController@overview');
$app->get('/api/article/listing','ArticleController@listing');
$app->get('/api/article/details','ArticleController@details');
$app->get('/api/article/{id}','ArticleController@getarticle');
$app->post('/api/article','ArticleController@createarticle');
$app->post('/api/article/mark-to-read/{id}','ArticleController@marktoread');
$app->post('/api/article/mark-with-star/{id}','ArticleController@markwithstar');
$app->post('/api/article/mark-all-as-read','ArticleController@markallasread');
$app->put('/api/article/{id}','ArticleController@updatearticle');
$app->delete('/api/article/{id}','ArticleController@deletearticle');

