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

$router->get('/', 'IndexController@index');
$router->get('/managefeeds', 'IndexController@managefeeds');
$router->get('/newfeed', 'IndexController@newfeed');
$router->get('/settings', 'SettingController@index');

//API's
$router->post('/api/settings', 'SettingController@store');

$router->get('/api/category', 'CategoryController@index');
$router->get('/api/category/overview', 'CategoryController@overview');
$router->get('/api/category/{id}', 'CategoryController@getcategory');
$router->post('/api/category', 'CategoryController@createcategory');
$router->post('/api/category/updateorder', 'CategoryController@updateorder');
$router->put('/api/category/{id}', 'CategoryController@updatecategory');
$router->delete('/api/category/{id}', 'CategoryController@deletecategory');

$router->get('/api/feed', 'FeedController@index');
$router->get('/api/feed/updateall', 'FeedController@updateall');
$router->get('/api/feed/update', 'FeedController@update');
$router->get('/api/feed/{id}', 'FeedController@getfeed');
$router->post('/api/feed', 'FeedController@createfeed');
$router->post('/api/feed/newrssfeed', 'FeedController@newrssfeed');
$router->post('/api/feed/changecategory', 'FeedController@changecategory');
$router->post('/api/feed/changeall', 'FeedController@changeall');
$router->put('/api/feed/{id}', 'FeedController@updatefeed');
$router->delete('/api/feed/{id}', 'FeedController@deletefeed');

$router->get('/api/fever', 'FeverController@getFever');
$router->post('/api/fever', 'FeverController@postFever');

$router->get('/api/article', 'ArticleController@index');
$router->get('/api/article/overview', 'ArticleController@overview');
$router->get('/api/article/listing', 'ArticleController@listing');
$router->get('/api/article/details', 'ArticleController@details');
$router->get('/api/article/{id}', 'ArticleController@getarticle');
$router->post('/api/article', 'ArticleController@createarticle');
$router->post('/api/article/mark-to-read/{id}', 'ArticleController@marktoread');
$router->post('/api/article/mark-to-unread/{id}', 'ArticleController@marktounread');
$router->post('/api/article/mark-with-star/{id}', 'ArticleController@markwithstar');
$router->post('/api/article/mark-all-as-read', 'ArticleController@markallasread');
$router->put('/api/article/{id}', 'ArticleController@updatearticle');
$router->delete('/api/article/{id}', 'ArticleController@deletearticle');
