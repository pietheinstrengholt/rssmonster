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

$router->get('/api/categories', 'CategoryController@index');
$router->get('/api/categories/overview', 'CategoryController@overview');
$router->get('/api/categories/{id}', 'CategoryController@getcategory');
$router->post('/api/categories', 'CategoryController@createcategory');
$router->post('/api/categories/updateorder', 'CategoryController@updateorder');
$router->put('/api/categories/{id}', 'CategoryController@updatecategory');
$router->delete('/api/categories/{id}', 'CategoryController@deletecategory');

$router->get('/api/feeds', 'FeedController@index');
$router->get('/api/feeds/updateall', 'FeedController@updateall');
$router->get('/api/feeds/update', 'FeedController@update');
$router->get('/api/feeds/{id}', 'FeedController@getfeed');
$router->post('/api/feeds', 'FeedController@createfeed');
$router->post('/api/feeds/newrssfeed', 'FeedController@newrssfeed');
$router->post('/api/feeds/changecategory', 'FeedController@changecategory');
$router->post('/api/feeds/changeall', 'FeedController@changeall');
$router->put('/api/feeds/{id}', 'FeedController@updatefeed');
$router->delete('/api/feeds/{id}', 'FeedController@deletefeed');

$router->get('/api/fever', 'FeverController@getFever');
$router->post('/api/fever', 'FeverController@postFever');

$router->get('/api/articles', 'ArticleController@index');
$router->get('/api/articles/overview', 'ArticleController@overview');
$router->get('/api/articles/listing', 'ArticleController@listing');
$router->get('/api/articles/details', 'ArticleController@details');
$router->get('/api/articles/{id}', 'ArticleController@getarticle');
$router->post('/api/articles', 'ArticleController@createarticle');
$router->post('/api/articles/mark-to-read/{id}', 'ArticleController@marktoread');
$router->post('/api/articles/mark-to-unread/{id}', 'ArticleController@marktounread');
$router->post('/api/articles/mark-with-star/{id}', 'ArticleController@markwithstar');
$router->post('/api/articles/mark-all-as-read', 'ArticleController@markallasread');
$router->put('/api/articles/{id}', 'ArticleController@updatearticle');
$router->delete('/api/articles/{id}', 'ArticleController@deletearticle');
