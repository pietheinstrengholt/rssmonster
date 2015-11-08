<?php

/**
 * The fever-api implements the API from Fever, allowing apps such as Reeder to  
 * communicate with this application. More info: http://feedafever.com/api.
 */
namespace App\Http\Controllers;

use App\Article;
use App\Category;
use App\Feed;
use Illuminate\Http\Request;

class FeverController extends Controller
{
    //TODO: Re-use functions from other classes

    public function getFever()
    {

        /* Fever API needs strings for category_id and feed_id's */

        //static for now
        $email = 'username';
        $pass = 'password';
        $api_key = md5($email.':'.$pass);

        //always return status 1: password and username correct
        $status = '1';

        //latest api version is 3
        $arr = ['api_version' => '3', 'auth' => $status];

        //last refreshed is current system time
        $time = ['last_refreshed_on_time' => strtotime('now')];
        $arr = array_merge($arr, $time);

        //when argument is groups, retrieve list with categories and id's
        if (isset($_GET['groups'])) {
            $groups = [];
            $Categories = Category::orderBy('category_order', 'asc')->get();
            if (! empty($Categories)) {
                foreach ($Categories as $Category) {
                    array_push($groups, [
                        'id' => (string) $Category->id,
                        'title' => $Category->name,
                    ]);
                }
            }
            $response_arr['groups'] = $groups;
            $arr = array_merge($arr, $response_arr);
        };
        //when argument is feeds, retrieve list with feeds and id's
        if (isset($_GET['feeds'])) {
            $feeds = [];
            $Feeds = Feed::orderBy('feed_name', 'asc')->get();
            if (! empty($Feeds)) {
                foreach ($Feeds as $Feed) {
                    array_push($feeds, [
                        'id'  => (int) $Feed->id,
                        'favicon_id' => (int) $Feed->id,
                        'title' => $Feed->feed_name,
                        'url' => $Feed->url,
                        'site_url' => $Feed->url,
                        'is_spark' => '0',
                        'last_updated_on_time' => strtotime($Feed->updated_at),
                    ]);
                }
            }
            $response_arr['feeds'] = $feeds;
            $arr = array_merge($arr, $response_arr);
        };
        //when argument is groups or feeds, also return feed id's linked to category id's
        if (isset($_GET['groups']) || isset($_GET['feeds'])) {
            $feeds_groups = [];

            //The array is composed with a group_id and feed_ids containing a string/comma-separated list of positive integers
            $Categories = Category::orderBy('category_order', 'asc')->get();
            if (! empty($Categories)) {
                foreach ($Categories as $key => $Category) {
                    $feeds_groups[$key]['group_id'] = (int) $Category->id;
                    $Feeds = Category::find($Category->id)->feeds;
                    if (! empty($Feeds)) {
                        $feed_ids = [];
                        foreach ($Feeds as $Feed) {
                            array_push($feed_ids, $Feed->id);
                        }
                        $feeds_groups[$key]['feed_ids'] = implode(',', $feed_ids);
                    }
                }
            }

            $response_arr['feeds_groups'] = $feeds_groups;
            $arr = array_merge($arr, $response_arr);
        };

        //return list with all unread article id's
        if (isset($_GET['unread_item_ids'])) {
            $unread_item_ids = [];
            $Articles = Article::where('status', 'unread')->orderBy('id', 'asc')->get();
            if (! empty($Articles)) {
                foreach ($Articles as $Article) {
                    array_push($unread_item_ids, $Article->id);
                }
            }
            //string/comma-separated list of positive integers instead of array
            $stack = implode(',', $unread_item_ids);
            $unreaditems = ['unread_item_ids' => $stack];
            $arr = array_merge($arr, $unreaditems);
        };

        //return string/comma-separated list with id's from read and starred articles
        if (isset($_GET['saved_item_ids'])) {
            $saved_item_ids = [];
            $Articles = Article::where('star_ind', '1')->orderBy('id', 'asc')->get();
            if (! empty($Articles)) {
                foreach ($Articles as $Article) {
                    array_push($saved_item_ids, $Article->id);
                }
            }
            //string/comma-separated list of positive integers instead of array
            $stack = implode(',', $saved_item_ids);
            $saveditems = ['saved_item_ids' => $stack];
            $arr = array_merge($arr, $saveditems);
        };

        //when argument is items, return 50 articles at a time
        if (isset($_GET['items'])) {
            $total_items = [];
            $total_items['total_items'] = Article::count();
            $arr = array_merge($arr, $total_items);

            $items = [];

            //request specific items, a maximum of 50 specific items requested by comma-separated argument
            if (isset($_GET['with_ids'])) {
                //list with id's is comma-separated, so transform to array
                $ArrayIds = explode(',', $_REQUEST['with_ids']);
                //create empty array to store Article results
                $Articles = [];
                if (! empty($ArrayIds)) {
                    foreach ($ArrayIds as $ArrayId) {
                        $Article = Article::find($ArrayId);
                        array_push($Articles, $Article);
                    }
                }
            //request 50 additional items using the highest id of locally cached items
            } elseif (isset($_REQUEST['since_id'])) {
                $Articles = Article::where('id', '>', $_REQUEST['since_id'])->orderBy('id', 'asc')->take(50)->get();

            //request 50 previous items using the lowest id of locally cached items
            } elseif (isset($_REQUEST['max_id'])) {
                $Articles = Article::where('id', '<', $_REQUEST['max_id'])->orderBy('id', 'asc')->take(50)->get();
            //if no argument is given provide total_items and up to 50 items
            } else {
                $Articles = Article::take(50)->orderBy('id', 'asc')->get();
            }

            if (! empty($Articles)) {
                foreach ($Articles as $Article) {
                    array_push($items, [
                        'id' => (int) $Article->id,
                        'feed_id' => (int) $Article->feed_id,
                        'title' => $Article->subject,
                        'author' => $Article->author,
                        'html' => $Article->content,
                        'url' => $Article->url,
                        'is_saved' => (int) $Article->star_ind,
                        'is_read' => $Article->status == 'read' ? 1 : 0,
                        'created_on_time' => strtotime($Article->published),
                    ]);
                }
            }

            $response_arr['items'] = $items;
            $arr = array_merge($arr, $response_arr);
        };

        //when argument is links, don't return anything at this moment
        if (isset($_GET['links'])) {
            $links = [];
            $response_arr['links'] = $links;
            $arr = array_merge($arr, $response_arr);
        };

        //when argument is groups, retrieve list with categories and id's
        if (isset($_GET['favicons'])) {
            $favicons = [];
            $Feeds = Feed::orderBy('feed_name', 'asc')->get();
            if (! empty($Feeds)) {
                foreach ($Feeds as $Feed) {
                    if (empty($Feed->favicon)) {
                        //TODO: replace with Laravel's URL functionality
                        $faviconurl = (isset($_SERVER['HTTPS']) ? 'https' : 'http').'://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI'];
                        $faviconurl = substr($faviconurl, 0, strpos($faviconurl, 'index.php/api')).'img/rss-default.png';
                    } else {
                        $faviconurl = $Feed->favicon;
                    }

                    array_push($favicons, [
                        'id' => (int) $Feed->id,
                        'title' => $faviconurl,
                    ]);
                }
                $response_arr['favicons'] = $favicons;
                $arr = array_merge($arr, $response_arr);
            }
        };

        //return fever response
        return response()->json($arr);
    }

    //TODO: Re-use functions from other classes

    public function postFever()
    {

        //mark items, groups or feed as read, saved or unsaved
        if (isset($_POST['mark'])) {

            //set before argument
            if (isset($_POST['before'])) {
                $time = date('Y-m-d H:i:s', $_POST['before']);
            } else {
                $time = time();
            }

            //per item
            if ($_REQUEST['mark'] == 'item') {
                $id = $_REQUEST['id'];
                if ($_REQUEST['as'] == 'read') {
                    Article::where('id', $id)->update(['status' => 'read']);
                } elseif ($_REQUEST['as'] == 'saved') {
                    Article::where('id', $id)->update(['star_ind' => '1']);
                } elseif ($_REQUEST['as'] == 'unsaved') {
                    Article::where('id', $id)->update(['status' => 'unread']);
                }
            }

            //per feed
            if ($_REQUEST['mark'] == 'feed') {
                $id = $_REQUEST['id'];
                if ($_REQUEST['as'] == 'read') {
                    Article::where('feed_id', $id)->where('created_at', '<', $time)->update(['status' => 'read']);
                } elseif ($_REQUEST['as'] == 'saved') {
                    Article::where('feed_id', $id)->where('created_at', '<', $time)->update(['star_ind' => '1']);
                } elseif ($_REQUEST['as'] == 'unsaved') {
                    Article::where('feed_id', $id)->where('created_at', '<', $time)->update(['status' => 'unread']);
                }
            }

            //per group, a group should be specified with an id not equal to zero
            if ($_REQUEST['mark'] == 'group' && $_REQUEST['id'] != '0') {

                //get feeds based on category_id
                $id = $_REQUEST['id'];
                $Feeds = Category::find($id)->feeds;

                if (! empty($Feeds)) {
                    foreach ($Feeds as $Feed) {
                        if ($_REQUEST['as'] == 'read') {
                            Article::where('feed_id', $Feed->id)->where('created_at', '<', $time)->update(['status' => 'read']);
                        } elseif ($_REQUEST['as'] == 'saved') {
                            Article::where('feed_id', $Feed->id)->where('created_at', '<', $time)->update(['star_ind' => '1']);
                        } elseif ($_REQUEST['as'] == 'unsaved') {
                            Article::where('feed_id', $Feed->id)->where('created_at', '<', $time)->update(['status' => 'unread']);
                        }
                    }
                }
            }

            //this is "all" according fever
            if ($_REQUEST['mark'] == 'group' && $_REQUEST['id'] == '0') {
                if ($_REQUEST['as'] == 'read') {
                    Article::where('created_at', '<', $time)->update(['status' => 'read']);
                } elseif ($_REQUEST['as'] == 'saved') {
                    Article::where('created_at', '<', $time)->update(['star_ind' => '1']);
                } elseif ($_REQUEST['as'] == 'unsaved') {
                    Article::where('created_at', '<', $time)->update(['status' => 'unread']);
                }
            }
        }
    }
}
