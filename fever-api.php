<?php

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

//includes
include 'config.php';
include 'database.class.php';
include 'functions.php';

//initialize database
$database = new Database();

//dump post data
file_put_contents('/tmp/fever-api-debug.txt', var_export($_POST, true), FILE_APPEND | LOCK_EX);

//static for now
$email  = 'username';
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

	$database->query("SELECT id, category_name FROM t_categories");
	$rows = $database->resultset();

	if (!empty($rows)) {
		foreach($rows as $row) {
			array_push($groups, array(
				"id" => $row['id'],
					"title" => $row['category_name']
				));
		}
	}

	$response_arr["groups"] = $groups;

	$arr = array_merge($arr, $response_arr);

};

//when argument is feeds, retrieve list with feeds and id's
if (isset($_GET['feeds'])) {

	$feeds = array();

	$database->query("SELECT * FROM t_feeds");
	$rows = $database->resultset();

	if (!empty($rows)) {
		foreach($rows as $row) {
			array_push($feeds, array(
		   "id"  => $row['id'],
		   "favicon_id" => $row['id'],
		   "title" => $row['feed_name'],
		   "url" => $row['url'],
		   "site_url" => $row['url'],
		   "is_spark" => "0",
		   "last_updated_on_time" => strtotime($row['last_update'])
			));
		}
	}

	$response_arr["feeds"] = $feeds;

	$arr = array_merge($arr, $response_arr);

};

//when argument is groups or feeds, return feed id's linked to category id's
if (isset($_GET['groups']) || isset($_GET['feeds'])) {

	$feeds_groups = array();

	$database->query("SELECT a.id as feedid, b.id as groupid FROM t_feeds a LEFT JOIN t_categories b on a.category_id = b.id");
	$rows = $database->resultset();

	if (!empty($rows)) {
		foreach($rows as $row) {
			array_push($feeds_groups, array(
				"group_id" => $row['groupid'],
				"feed_ids" => $row['feedid']
			));
		}
	}

	$response_arr["feeds_groups"] = $feeds_groups;

	$arr = array_merge($arr, $response_arr);

};

//return list with all unread article id's
if (isset($_GET['unread_item_ids'])) {

	$unread_item_ids = array();

	$database->query("SELECT * FROM t_articles WHERE status = 'unread' ORDER BY ID");
	$rows = $database->resultset();

	if (!empty($rows)) {
		foreach($rows as $row) {
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

	//request specific items, a maximum of 50 specific items requested by comma-separated argument
	if (isset($_GET['with_ids'])) {

		$ids = $_REQUEST["with_ids"];

		$items = array();

		$database->query("SELECT * FROM t_articles WHERE ID IN ($ids) ORDER BY ID");
		$rows = $database->resultset();

		if (!empty($rows)) {
			foreach($rows as $row) {

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
		}

		$response_arr["items"] = $items;

		$arr = array_merge($arr, $response_arr);

	//request 50 additional items using the highest id of locally cached items
	} elseif (is_numeric($_REQUEST["since_id"])) {

		$since_id = $_REQUEST["since_id"];

		$items = array();

		$database->query("SELECT * FROM t_articles WHERE ID > '$since_id' ORDER BY ID LIMIT 0,50");
		$rows = $database->resultset();

		if (!empty($rows)) {
			foreach($rows as $row) {

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
		}

		$response_arr["items"] = $items;

		$arr = array_merge($arr, $response_arr);

	//request 50 previous items using the lowest id of locally cached items
	} elseif (is_numeric($_REQUEST["max_id"])) {

		$max_id = $_REQUEST["max_id"];

		$items = array();

		$database->query("SELECT * FROM t_articles WHERE ID < '$max_id' ORDER BY ID LIMIT 0,50");
		$rows = $database->resultset();

		if (!empty($rows)) {
			foreach($rows as $row) {

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
		}

		$response_arr["items"] = $items;

		$arr = array_merge($arr, $response_arr);

	//if no argument is given provide total_items and up to 50 items
	} else {

		$database->query("SELECT count(*) as count FROM t_articles");
		$rows = $database->resultset();

		if (!empty($rows)) {
		
			$total_items = array();
		
			foreach($rows as $row) {
				array_push($total_items, array(
					"total_items" => $row['count']
				));
			}
			
			$arr = array_merge($arr, $total_items);

			$items = array();

			$database->query("SELECT * FROM t_articles ORDER BY ID LIMIT 0,50");
			$rows = $database->resultset();

			if (!empty($rows)) {
				foreach($rows as $row) {

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
		}
	}
};

//return string/comma-separated list with id's from read articles
if (isset($_GET['saved_item_ids'])) {

	$saved_item_ids = array();

	$database->query("SELECT * FROM t_articles WHERE status = 'read' ORDER BY ID");
	$rows = $database->resultset();

	if (!empty($rows)) {
		foreach($rows as $row) {
			array_push($saved_item_ids, $row['id']);
		}
	}

	//string/comma-separated list of positive integers instead of array
	$stack = implode(',', $saved_item_ids);

	$readitems = array("saved_item_ids" => $stack);

	$arr = array_merge($arr, $readitems);

};


if (isset($_GET['links'])) {

	$links = array();

	$response_arr["links"] = $links;

	$arr = array_merge($arr, $response_arr);

};

//when argument is groups, retrieve list with categories and id's
if (isset($_GET['favicons'])) {

	$favicons = array();

	$database->query("SELECT id, favicon FROM t_feeds");
	$rows = $database->resultset();

	if (!empty($rows)) {
		foreach($rows as $row) {
			array_push($favicons, array(
				"id" => $row['id'],
				"title" => $row['favicon']
			));
		}
		$response_arr["favicons"] = $favicons;

		$arr = array_merge($arr, $response_arr);		
	}
};

print json_encode($arr);

//mark items, groups or feed as read, saved or unsaved
if (isset($_POST['mark'])) {

	if (isset($_POST['before'])) { $time = date("Y-m-d H:i:s",$_POST['before']); } else { $time = time(); }

	if ($_REQUEST["mark"] == "item") {

		$id = $_REQUEST["id"];

		$database->beginTransaction();

		if ($_REQUEST["as"] == "read") {
			$database->query("UPDATE t_articles SET status = 'read' WHERE id = '$id'");
		} elseif ($_REQUEST["as"] == "saved") {
			$database->query("UPDATE t_articles SET star_ind = '1' WHERE id = '$id'");
		} elseif ($_REQUEST["as"] == "unsaved") {
			$database->query("UPDATE t_articles SET star_ind = '0' WHERE id = '$id'");
		}

		$database->execute();
		$database->endTransaction();

	}

	//feeds
	if ($_REQUEST["mark"] == "feed") {

		$id = $_REQUEST["id"];

		$database->beginTransaction();

		if ($_REQUEST["as"] == "read") {
			$database->query("UPDATE t_articles SET status = 'read' WHERE feed_id = '$id' AND insert_date < '$time'");
		} elseif ($_REQUEST["as"] == "saved") {
			$database->query("UPDATE t_articles SET star_ind = '1' WHERE feed_id = '$id' AND insert_date < '$time'");
		} elseif ($_REQUEST["as"] == "unsaved") {
			$database->query("UPDATE t_articles SET star_ind = '0' WHERE feed_id = '$id' AND insert_date < '$time'");
		}

		$database->execute();
		$database->endTransaction();

	}

	//a group should be specified with an id not equal to zero
	if ($_REQUEST["mark"] == "group" && $_REQUEST["id"] != "0") {

		$id = $_REQUEST["id"];

		$database->beginTransaction();

		if ($_REQUEST["as"] == "read") {
			$database->query("UPDATE `t_articles` SET status = 'read' WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE category_id = '$id') AND insert_date < '$time'");
		} elseif ($_REQUEST["as"] == "saved") {
			$database->query("UPDATE `t_articles` SET star_ind = '1' WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE category_id = '$id') AND insert_date < '$time'");
		} elseif ($_REQUEST["as"] == "unsaved") {
			$database->query("UPDATE `t_articles` SET star_ind = '0' WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE category_id = '$id') AND insert_date < '$time'");
		}

		$database->execute();
		$database->endTransaction();
	}

	//this is "all" to fever
	if ($_REQUEST["mark"] == "group" && $_REQUEST["id"] == "0") {

		$database->beginTransaction();

		if ($_REQUEST["as"] == "read") {
			$database->query("UPDATE `t_articles` SET status = 'read' WHERE insert_date < '$time'");
		} elseif ($_REQUEST["as"] == "saved") {
			$database->query("UPDATE `t_articles` SET star_ind = '1' WHERE insert_date < '$time'");
		} elseif ($_REQUEST["as"] == "unsaved") {
			$database->query("UPDATE `t_articles` SET star_ind = '0' WHERE insert_date < '$time'");
		}

		$database->execute();
		$database->endTransaction();
	}
}

?>
