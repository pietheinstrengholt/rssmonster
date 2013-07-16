<?php

//include
include 'config.php';
include 'functions.php';

//dump post data
//file_put_contents('/tmp/fever-api-debug.txt', var_export($_POST, true), FILE_APPEND | LOCK_EX);

//static for now
$email  = 'you@yourdomain.com';
$pass   = 'password';
$api_key = md5($email.':'.$pass);

//always return status 1: password and username correct
$status = "1";

//latest api version is 3
$arr = array("api_version" => "3", "auth" => $status);

//last refreshed is current system time
$time = array("last_refreshed_on_time" => strtotime("now"));
$arr = array_merge($arr, $time);

//when argument is groups, retrieve list with categories and id's
if (isset($_GET['groups'])) {

	$groups = array();

	$sql = mysql_query("SELECT id, name FROM category") or trigger_error(mysql_error(), E_USER_WARNING);

	while($row = mysql_fetch_array($sql)) {
		array_push($groups, array(
			"id" => $row['id'],
           		"title" => $row['name']
        	));
	}

	$response_arr["groups"] = $groups;

	$arr = array_merge($arr, $response_arr);

};

//when argument is feeds, retrieve list with feeds and id's
if (isset($_GET['feeds'])) {

	$feeds = array();

        $sql = mysql_query("SELECT * FROM feeds") or trigger_error(mysql_error(), E_USER_WARNING);

        while($row = mysql_fetch_array($sql)) {
                array_push($feeds, array(
	           "id"  => $row['id'],
        	   "favicon_id" => $row['id'],
	           "title" => $row['name'],
	           "url" => $row['url'],
	           "site_url" => $row['url'],
	           "is_spark" => "0",
	           "last_updated_on_time" => strtotime($row['last_update'])
                ));
        }


        $response_arr["feeds"] = $feeds;

	$arr = array_merge($arr, $response_arr);

};

//when argument is groups or feeds, return feed id's linked to category id's
if (isset($_GET['groups']) || isset($_GET['feeds'])) {

        $feeds_groups = array();

        $sql = mysql_query("SELECT a.id as feedid, b.id as groupid FROM feeds a LEFT JOIN category b on a.category = b.id") or trigger_error(mysql_error(), E_USER_WARNING);

        while($row = mysql_fetch_array($sql)) {
                array_push($feeds_groups, array(
           		"group_id" => $row['groupid'],
          		"feed_ids" => $row['feedid']

                ));
        }

	$response_arr["feeds_groups"] = $feeds_groups;

        $arr = array_merge($arr, $response_arr);

};

//return list with all unread article id's
if (isset($_GET['unread_item_ids'])) {

	$unread_item_ids = array();

        $sql = mysql_query("SELECT * FROM articles WHERE status = 'unread' ORDER BY ID") or trigger_error(mysql_error(), E_USER_WARNING);

	while($row = mysql_fetch_array($sql)) {
   	  if (!empty($row)) {
	      array_push($unread_item_ids, $row['id']);
	  }
	}

	//string/comma-separated list of positive integers instead of array
	$stack = implode(',', $unread_item_ids);

	$unreaditems = array("unread_item_ids" => $stack);

	$arr = array_merge($arr, $unreaditems);

};

//when argument is items, return 50 articles at a time
if (isset($_GET['items'])) {

	if (isset($_GET['with_ids'])) {

	   $ids = $_REQUEST["with_ids"];

           $items = array();

           $sql = mysql_query("SELECT * FROM articles WHERE ID IN ($ids) ORDER BY ID") or trigger_error(mysql_error(), E_USER_WARNING);

           while($row = mysql_fetch_array($sql)) {

               if ($row['status'] == "read") { $isread = '1'; } elseif ($row['status'] == "unread") { $isread = '0'; }

               array_push($items, array(
                   "id" => $row['id'],
                   "feed_id" => $row['feed_id'],
                   "title" => $row['subject'],
                   "author" => $row['author'],
                   "html" => $row['content'],
                   "url" => $row['url'],
                   "is_saved" => $row['star_ind'],
                   "is_read" => $isread,
                   "created_on_time" => strtotime($row['publish_date'])
                ));
           }

           $response_arr["items"] = $items;

           $arr = array_merge($arr, $response_arr);

	} elseif (is_numeric($_REQUEST["since_id"])) {

	   $since_id = $_REQUEST["since_id"];

	   $items = array();

	   $sql = mysql_query("SELECT * FROM articles WHERE ID > '$since_id' ORDER BY ID LIMIT 0,50") or trigger_error(mysql_error(), E_USER_WARNING);

	   while($row = mysql_fetch_array($sql)) {

	       if ($row['status'] == "read") { $isread = '1'; } elseif ($row['status'] == "unread") { $isread = '0'; }

               array_push($items, array(
	           "id" => $row['id'],
	           "feed_id" => $row['feed_id'],
	           "title" => $row['subject'],
	           "author" => $row['author'],
	           "html" => $row['content'],
	           "url" => $row['url'],
	           "is_saved" => $row['star_ind'],
	           "is_read" => $isread,
	           "created_on_time" => strtotime($row['publish_date'])
        	));
	   }

           $response_arr["items"] = $items;

           $arr = array_merge($arr, $response_arr);

	} else { 

        $sql = mysql_query("SELECT count(*) as count FROM articles") or trigger_error(mysql_error(), E_USER_WARNING);

	$total_items = array();

        while($row = mysql_fetch_array($sql)) {
                array_push($total_items, array(
           		"total_items" => $row['count']
                ));
        }

        $arr = array_merge($arr, $total_items);

	$items = array();

           $sql = mysql_query("SELECT * FROM articles ORDER BY ID LIMIT 0,50") or trigger_error(mysql_error(), E_USER_WARNING);

           while($row = mysql_fetch_array($sql)) {

	       if ($row['status'] == "read") { $isread = '1'; } elseif ($row['status'] == "unread") { $isread = '0'; }

               array_push($items, array(
                   "id" => $row['id'],
                   "feed_id" => $row['feed_id'],
                   "title" => $row['subject'],
                   "author" => $row['author'],
                   "html" => $row['content'],
                   "url" => $row['url'],
                   "is_saved" => $row['star_ind'],
                   "is_read" => $isread,
                   "created_on_time" => strtotime($row['publish_date'])
                ));
           }


        $response_arr["items"] = $items;

        $arr = array_merge($arr, $response_arr);

  }

};

if (isset($_GET['saved_item_ids'])) {

        $saved_item_ids = array();

        $sql = mysql_query("SELECT * FROM articles WHERE status = 'read' ORDER BY ID") or trigger_error(mysql_error(), E_USER_WARNING);

        while($row = mysql_fetch_array($sql)) {
          if (!empty($row)) {
              array_push($saved_item_ids, $row['id']);
          }
        }

        //string/comma-separated list of positive integers instead of array
        $stack = implode(',', $saved_item_ids);

        $unreaditems = array("saved_item_ids" => $stack);

        $arr = array_merge($arr, $unreaditems);

};


if (isset($_GET['links'])) {

        $links = array();

        $response_arr["links"] = $links;

        $arr = array_merge($arr, $response_arr);

};

//when argument is groups, retrieve list with categories and id's
if (isset($_GET['favicons'])) {

        $favicons = array();

        $sql = mysql_query("SELECT id, favicon FROM feeds") or trigger_error(mysql_error(), E_USER_WARNING);

        while($row = mysql_fetch_array($sql)) {
                array_push($favicons, array(
                        "id" => $row['id'],
                        "title" => $row['favicon']
                ));
        }

        $response_arr["favicons"] = $favicons;

        $arr = array_merge($arr, $response_arr);

};

print json_encode($arr);

//mark items, groups or feed as read, saved or unsaved
if (isset($_POST['mark'])) {

  if ($_REQUEST["mark"] == "item") {

    $id = $_REQUEST["id"];

    if ($_REQUEST["as"] == "read") {
	mysql_query("UPDATE articles SET status = 'read' WHERE id = '$id'");
    } elseif ($_REQUEST["as"] == "saved") {
	mysql_query("UPDATE articles SET star_ind = '1' WHERE id = '$id'");
    } elseif ($_REQUEST["as"] == "unsaved") {
	mysql_query("UPDATE articles SET star_ind = '0' WHERE id = '$id'");
    }

  }

  //feeds
  if ($_REQUEST["mark"] == "feed") {

    $id = $_REQUEST["id"];

    if (isset($_POST['before'])) { $time = date("Y-m-d H:i:s",$_POST['before']); } else { $time = time(); }

    if ($_REQUEST["as"] == "read") {
        mysql_query("UPDATE articles SET status = 'read' WHERE feed_id = '$id' AND insert_date < $time");
    } elseif ($_REQUEST["as"] == "saved") {
        mysql_query("UPDATE articles SET star_ind = '1' WHERE feed_id = '$id' AND insert_date < $time");
    } elseif ($_REQUEST["as"] == "unsaved") {
        mysql_query("UPDATE articles SET star_ind = '0' WHERE feed_id = '$id' AND insert_date < $time");
    }

    //TODO: add before=? statement

  }

  //a group should be specified with an id not equal to zero
  if ($_REQUEST["mark"] == "group" && $_REQUEST["id"] != "0") {

    $id = $_REQUEST["id"];

    if (isset($_POST['before'])) { $time = date("Y-m-d H:i:s",$_POST['before']); } else { $time = time(); }

    if ($_REQUEST["as"] == "read") {
        mysql_query("UPDATE `articles` SET status = 'read' WHERE feed_id IN (SELECT DISTINCT id FROM feeds WHERE category = '$id') AND insert_date < '$time'");
    } elseif ($_REQUEST["as"] == "saved") {
        mysql_query("UPDATE `articles` SET star_ind = '1' WHERE feed_id IN (SELECT DISTINCT id FROM feeds WHERE category = '$id') AND insert_date < '$time'");
    } elseif ($_REQUEST["as"] == "unsaved") {
        mysql_query("UPDATE `articles` SET star_ind = '0' WHERE feed_id IN (SELECT DISTINCT id FROM feeds WHERE category = '$id') AND insert_date < '$time'");
    }

  }

  //this is "all" to fever
  if ($_REQUEST["mark"] == "group" && $_REQUEST["id"] == "0") {

    $id = $_REQUEST["id"];

    if (isset($_POST['before'])) { $time = date("Y-m-d H:i:s",$_POST['before']); } else { $time = time(); }

    if ($_REQUEST["as"] == "read") {
        mysql_query("UPDATE `articles` SET status = 'read' WHERE insert_date < '$time'");
    } elseif ($_REQUEST["as"] == "saved") {
        mysql_query("UPDATE `articles` SET star_ind = '1' WHERE insert_date < '$time'");
    } elseif ($_REQUEST["as"] == "unsaved") {
        mysql_query("UPDATE `articles` SET star_ind = '0' WHERE insert_date < '$time'");
    }

  }


}

?>
