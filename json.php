<?php

/**
 * json.php
 *
 * The json.php file is responsible reads
 * information from the database and returns 
 * information in JSON.
 *
 */

//usage: curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "debug"}' http://phppaperlocation/json.php
//usage: http POST http://phppaperlocation/json.php jsonrpc="2.0" request="debug" -b

// Report simple running errors
error_reporting(E_ERROR | E_WARNING | E_PARSE);

include 'config.php';
include 'database.class.php';

//initialize database
$database = new Database();

//debugging and error message
$debug = array('a' => 1, 'b' => 2, 'c' => 3, 'd' => 4, 'e' => 5);
$error = array('response'=>"Incorrect JSON message");

//header type is json
header('Content-Type: application/json');
$arr = json_decode(file_get_contents('php://input'), true);

//if json argument isn't given exit
if ($arr['jsonrpc'] != "2.0") {
	echo json_encode($error);
	exit;
}

//set sort default to DESC
if(!isset($arr['sort'])){
	$sort = 'desc';
} else {
	$sort = $arr['sort'];
}

//update feedname or feed category
if(isset($arr['update'])){
	if ($arr['update'] == "feeds") {
		if (empty($arr['feed_id'])) {
			exit;
		} else if (empty($arr['feed_name']) && empty($arr['category_name'])) {
			exit;
		} else {

			//check if category already exists in category table
			$database->query("SELECT id FROM t_categories WHERE category_name=:category_name");
			$database->bind(':category_name', $arr['category_name']);
			$row = $database->single();

			//category already exists in db, use id from query
			if (!empty($row)) {
				$existingcategoryid = $row['id'];

				$database->beginTransaction();
				$database->query("UPDATE t_feeds SET feed_name=:feed_name, category_id=:category_id WHERE id=:feed_id");
				$database->bind(':feed_name', $arr['feed_name']);
				$database->bind(':category_id', $row['id']);
				$database->bind(':feed_id', $arr['feed_id']);
				$database->execute();
				$database->endTransaction();
				echo json_encode("done");
			//category does not exist
			} else {
				//insert new category
				$database->beginTransaction();
				$database->query("INSERT INTO t_categories (category_name) VALUES (:category_name)");
				$database->bind(':category_name', $arr['category_name']);
				$database->execute();
				$database->endTransaction();
				
				//get lastInsertId from change request table
				$database->query("SELECT id FROM t_categories ORDER BY id ASC");
				$categories = $database->resultset();
				$countcategories = count($categories)-1;
				$newcategoryid = $categories[$countcategories]['id'];				

				//change existing feeds to new category
				$database->beginTransaction();
				$database->query("UPDATE t_feeds SET feed_name=:feed_name, category_id=:category_id WHERE id=:feed_id");
				$database->bind(':feed_name', $arr['feed_name']);
				$database->bind(':category_id', $newcategoryid);
				$database->bind(':feed_id', $arr['feed_id']);				
				$database->execute();
				$database->endTransaction();
				echo json_encode("done");
			}
			
			//delete unassigned categories
			$database->beginTransaction();
			$database->query("DELETE FROM t_categories WHERE id NOT IN (SELECT DISTINCT category_id FROM t_feeds)");			
			$database->execute();
			$database->endTransaction();			

		}
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "read-status", "value": "1"}' http://phppaperlocation/json.php
//get article status, read or unread
if(isset($arr['request'])){

	if ($arr['request'] == "get-article-list") {

		$unread_item_ids = array();

		if(isset($arr['status'])){ $status = htmlspecialchars($arr['status']); } else { $status = NULL; }
		if(isset($arr['category_id'])){ $category_id = $arr['category_id']; } else { $category_id = NULL; }
		if(isset($arr['feed_id'])){ $feed_id = $arr['feed_id']; } else { $feed_id = NULL; }

		if ($status == "starred") {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE star_ind = '1' ORDER BY publish_date $sort");
		} elseif ($status == "read") {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE status = 'read' ORDER BY publish_date $sort");
		//by category
		} elseif (!empty($category_id) && empty($feed_id)) {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE category_id IN (SELECT id FROM t_categories WHERE id = $category_id)) AND status = 'unread' ORDER BY publish_date $sort");
		//by feed
		} elseif (!empty($feed_id) && empty($category_id)) {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE id = $feed_id) AND status = 'unread' ORDER BY publish_date $sort");
		} elseif (urldecode($status) == 'last 24 hours') {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE status = 'unread' AND publish_date BETWEEN (NOW() - INTERVAL 1 DAY) AND NOW() ORDER BY publish_date $sort");
		} elseif (urldecode($status) == 'last hour') {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE status = 'unread' AND publish_date BETWEEN (NOW() - INTERVAL 1 HOUR) AND NOW() ORDER BY publish_date $sort");
		} else {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE status = 'unread' ORDER BY publish_date $sort");
		}

		$rows = $database->resultset();

		if (!empty($rows)) {
			foreach($rows as $row) {
				array_push($unread_item_ids, $row['id']);
			}
			$unread_item_ids = array_chunk($unread_item_ids, 10);

			echo json_encode($unread_item_ids);	
		}
	}


	if ($arr['request'] == "debug") {
		echo json_encode($debug);
	}

	//get overview with all feeds, sorted by name
	if ($arr['request'] == "get-feeds") {
		$database->query("SELECT a.feed_name, a.id, a.url, b.category_name FROM t_feeds a LEFT JOIN t_categories b ON a.category_id = b.id ORDER BY a.feed_name");
		$rows = $database->resultset();
		if (!empty($rows)) {	  
			echo json_encode($rows);
		}
	}

	if ($arr['request'] == "read-status") {
		$database->query("SELECT status from t_articles WHERE id = $arr[value]");
		$row = $database->single();
		if (!empty($row)) {
			echo json_encode($row['status']);
		}
	}

	//get article content
	if ($arr['request'] == "read-content") {
		$database->query("SELECT content from t_articles WHERE id = $arr[value]");
		$row = $database->single();
		if (!empty($row)) {
			echo json_encode($row['content']);
		}
	}
	
	//get count-per-category
	if ($arr['request'] == "count-per-category") {
		$database->query("SELECT id, feed_name, favicon, count FROM (SELECT * FROM t_feeds WHERE category_id IN (SELECT DISTINCT id FROM t_categories WHERE id = '$arr[value]')) a left join (SELECT count(*) AS count, feed_id FROM t_articles WHERE status = 'unread' GROUP BY feed_id) b on a.id = b.feed_id");
		$rows = $database->resultset();
		if (!empty($rows)) {
			echo json_encode($rows);
		}
	}

	//http POST http://phppaperlocation/json.php jsonrpc="2.0" request="get-articles" offset="0" postnumbers="10" -b
	//get article content and other information
	if ($arr['request'] == "get-articles") {

		if (empty($arr['status'])) {
			$status = 'unread';
		} else {
			$status = $arr['status'];
		}

		//article id are filled in
		if (!empty($arr['article_id'])) {
			$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.id IN ($arr[article_id]) ORDER BY publish_date $sort");
		//per feed
		} elseif (!empty($arr['input_feed']) && empty($arr['input_category'])) {
			$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE status = '$status' AND feed_id = (SELECT id FROM `feeds` WHERE feed_name = '$arr[input_feed]') ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
		//per category
		} elseif (!empty($arr['input_category']) && empty($arr['input_feed'])) {
			$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.status = '$status' AND feed_id in (SELECT id FROM `feeds` WHERE category_id = '$arr[input_category]') ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
		//last unread 25 or 50
		} else {
			if ($status == 'starred') {
				$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.star_ind = '1' ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
			} else if (urldecode($status) == 'last 24 hours') {
				$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND publish_date between (NOW() - INTERVAL 1 DAY) AND NOW() ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
			} else if (urldecode($status) == 'last hour') {
				$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND publish_date between (NOW() - INTERVAL 1 HOUR) AND NOW() ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
			} else {
				$database->query("SELECT t1.id, status, t1.url, subject, content, publish_date, feed_name, category_id, star_ind, author FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.status = '$status' ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
			}
		}

		$rows = $database->resultset();

		if (empty($rows)) {
			echo json_encode("no-results");
		} else {
			$rows = array_filter($rows);
			echo json_encode($rows);
		}
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "read-status", "value": "1"}' http://phppaperlocation/json.php
//update read status and return url as success value
if(isset($arr['update'])){

	//todo: return category, feedname
	if ($arr['update'] == "item-as-read") {
		$database->query("SELECT * FROM v_id_status WHERE id = '$arr[value]'");
		$rows = $database->resultset();
		if (!empty($rows)){
			echo json_encode($rows);	
		}

		$database->beginTransaction();
		$database->query("UPDATE t_articles SET status = 'read' WHERE id IN ($arr[value])");
		$database->execute();
		$database->endTransaction();
	}

	if ($arr['update'] == "read-status") {
		$database->query("SELECT url FROM t_articles WHERE id = $arr[value]");
		$row = $database->single();
		echo json_encode($row['url']);
		
		$database->beginTransaction();
		$database->query("UPDATE t_articles SET status = 'read' WHERE id IN ($arr[value])");
		$database->execute();
		$database->endTransaction();
	}

	//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "star-mark", "value": "1"}' http://phppaperlocation/json.php
	//update article to mark as star or unstar
	if ($arr['update'] == "star-mark") {
		$database->beginTransaction();
		$database->query("UPDATE t_articles SET star_ind = '1' WHERE id = $arr[value]");
		$database->execute();
		$database->endTransaction();
		echo json_encode("done");
	} 
	
	if ($arr['update'] == "star-unmark") {
		$database->beginTransaction();
		$database->query("UPDATE t_articles SET star_ind = '0' WHERE id = $arr[value]");
		$database->execute();
		$database->endTransaction();
		echo json_encode("done");
	}

	//http POST http://phppaperlocation/json.php jsonrpc="2.0" update="mark-as-read" -b
	//update read status for article
	if ($arr['update'] == "mark-as-read" && $arr[status] != 'starred' && $arr[status] != 'read') {
		$database->beginTransaction();
		if (!empty($arr[value])) {
			$database->query("UPDATE t_articles SET status = 'read' WHERE id in ($arr[value])");
		//mark a feed as read
		} elseif (!empty($arr[input_feed]) && empty($arr[input_category])) {
			$database->query("UPDATE t_articles SET status = 'read' WHERE feed_id = (SELECT id FROM `t_feeds` WHERE feed_name = '$arr[input_feed]')");
		//mark a category as read
		} elseif (!empty($arr[input_category]) && empty($arr[input_feed])) {
			$database->query("UPDATE t_articles SET status = 'read' WHERE feed_id in (SELECT id FROM `t_feeds` WHERE category_id = '$arr[input_category]')");
		//set all items to read
		} elseif ($arr[status] == 'unread' || empty($arr[status])) {
			$database->query("UPDATE t_articles SET status = 'read'");
		}
		$database->execute();
		$database->endTransaction();
		echo json_encode("done");
	}

	//update unread status for article
	if ($arr['update'] == "mark-as-unread" && $arr[status] != 'starred' && $arr[status] != 'read') {
		if (!empty($arr[value])) {
			$database->beginTransaction();
			$database->query("UPDATE t_articles set status = 'unread' WHERE id in ($arr[value])");
			$database->execute();
			$database->endTransaction();
			echo json_encode("done");
		}
	}
}

//provide overview with feeds, e.g. names, categories, count unreaded number of articles
if(isset($arr['overview'])){
	if ($arr['overview'] == "feed") {
		$database->query("SELECT feed_name, count(*) AS count FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND t2.feed_name != '' GROUP BY feed_name ORDER BY feed_name");
	} 
	
	if ($arr['overview'] == "category-detailed") {
		$database->query("SELECT t1.id, t1.category_name, IFNULL(count_all,0) AS count_all, IFNULL(count_unread,0) AS count_unread FROM

		(SELECT count(*) as count_all, c.id, c.category_name FROM `t_articles` a
		LEFT JOIN t_feeds b
		on a.feed_id = b.id
		LEFT JOIN t_categories c
		on b.category_id = c.id
		GROUP BY category_id, category_name) t1

		LEFT JOIN

		(SELECT count(*) AS count_unread, c.id, c.category_name FROM `t_articles` a
		LEFT JOIN t_feeds b
		on a.feed_id = b.id
		LEFT JOIN t_categories c
		on b.category_id = c.id
		WHERE a.status = 'unread'
		GROUP BY category_id, category_name) t2

		ON t1.id = t2.id
		ORDER BY t1.category_name");
	} 
	
	if ($arr['overview'] == "status") {
		$database->query("SELECT * FROM v_overview_status");
	}
	
	$rows = $database->resultset();
	
	if (!empty($rows)){
		echo json_encode($rows);	
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","delete": "feed", "value": "1"}' http://phppaperlocation/json.php
//delete feed
if(isset($arr['delete'])){
	if ($arr['delete'] == "feed") {
		$database->beginTransaction();
		$database->query("DELETE from t_feeds WHERE id = $arr[value]");
		$database->execute();
		$database->endTransaction();	
		echo json_encode("done");
	}
}

?>
