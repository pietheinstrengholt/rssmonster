<?php

/**
 * json.php
 *
 * The json.php file is responsible reads
 * information from the database and returns 
 * information in JSON.
 *
 */

//usage: curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "debug"}' http://RSSMonsterlocation/json.php
//usage: http POST http://RSSMonsterlocation/json.php jsonrpc="2.0" request="debug" -b

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
			$database->query("DELETE FROM t_categories WHERE id NOT IN (SELECT DISTINCT category_id FROM t_feeds) AND id <> 1");			
			$database->execute();
			$database->endTransaction();			

		}
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "read-status", "value": "1"}' http://RSSMonsterlocation/json.php
//get article status, read or unread
if(isset($arr['request'])){

	if ($arr['request'] == "get-article-list") {

		$unread_item_ids = array();

		if(isset($arr['status'])){ $status = htmlspecialchars($arr['status']); } else { $status = "unread"; }
		if(isset($arr['category_id'])){ $category_id = $arr['category_id']; } else { $category_id = NULL; }
		if(isset($arr['feed_id'])){ $feed_id = $arr['feed_id']; } else { $feed_id = NULL; }

		//get articleIds with unread status
		if ($status == "unread") {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE status = 'unread' ORDER BY publish_date $sort");
		}
		//get articleIds with starred status
		if ($status == "starred") {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE star_ind = '1' ORDER BY publish_date $sort");
		} 
		//get articleIds with read status
		if ($status == "read") {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE status = 'read' ORDER BY publish_date $sort");
		}
		//get articleIds for selected category
		if (!empty($category_id) && empty($feed_id)) {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE category_id IN (SELECT id FROM t_categories WHERE id = $category_id)) AND status = 'unread' ORDER BY publish_date $sort");

		} 
		//get articleIds for selected feed
		if (!empty($feed_id) && empty($category_id)) {
			$database->query("SELECT DISTINCT id FROM t_articles WHERE feed_id IN (SELECT DISTINCT id FROM t_feeds WHERE id = $feed_id) AND status = 'unread' ORDER BY publish_date $sort");
		}

		$rows = $database->resultset();

		if (!empty($rows)) {
			foreach($rows as $row) {
				array_push($unread_item_ids, $row['id']);
			}

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
	
	//get count-per-category
	if ($arr['request'] == "count-per-category") {
		$database->query("SELECT id, feed_name, favicon, count FROM (SELECT * FROM t_feeds WHERE category_id IN (SELECT DISTINCT id FROM t_categories WHERE id = '$arr[value]')) a LEFT JOIN (SELECT count(*) AS count, feed_id FROM t_articles WHERE status = 'unread' GROUP BY feed_id) b on a.id = b.feed_id");
		$rows = $database->resultset();
		if (!empty($rows)) {
			echo json_encode($rows);
		}
	}

	//http POST http://RSSMonsterlocation/json.php jsonrpc="2.0" request="get-articles" offset="0" postnumbers="10" -b
	//get article content requested by ajax.php
	if ($arr['request'] == "get-articles") {

		//article id are filled in
		if (!empty($arr['article_id'])) {
			$database->query("SELECT a.id, feed_id, a.url, star_ind, author, subject, content, publish_date, feed_name, category_id
			FROM (SELECT id, feed_id, url, star_ind, author, subject, content, publish_date FROM t_articles 
			WHERE id IN ($arr[article_id])) a
			INNER JOIN t_feeds b
			ON a.feed_id = b.id
			ORDER BY publish_date $sort");
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

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "read-status", "value": "1"}' http://RSSMonsterlocation/json.php
//update read status and return url as success value
if(isset($arr['update'])){

	if ($arr['update'] == "mark-item-as-read" || $arr['update'] == "mark-item-as-unread") {
	
		if (!empty($arr['value'])) {
	
			//first return article status, feed, category information to update sidebar statistics
			$database->query("SELECT a.id, status, feed_id, feed_name, category_id, category_name FROM t_articles a
			INNER JOIN t_feeds b
			ON a.feed_id = b.id
			INNER JOIN t_categories c
			ON b.category_id = c.id
			WHERE a.id = '$arr[value]'");
			
			$row = $database->single();

			if (!empty($row)){
				echo json_encode($row);	
			}
			
			//update unread status for article
			if ($arr['update'] == "mark-item-as-read") {
				$updatestatus = "read";
			} elseif ($arr['update'] == "mark-item-as-unread") {
				$updatestatus = "unread";
			}
			
			//update with new status
			$database->beginTransaction();
			$database->query("UPDATE t_articles SET status = :status WHERE id = '$arr[value]'");
			$database->bind(':status', $updatestatus);
			$database->execute();
			$database->endTransaction();
			
		}
	}
	

	//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "star-mark", "value": "1"}' http://RSSMonsterlocation/json.php
	//update article to mark as star or unstar
	if ($arr['update'] == "star-mark") {
		if (!empty($arr['value'])) {	
			$database->beginTransaction();
			$database->query("UPDATE t_articles SET star_ind = '1' WHERE id = $arr[value]");
			$database->execute();
			$database->endTransaction();
			echo json_encode("done");
		}
	} 
	
	if ($arr['update'] == "star-unmark") {
		if (!empty($arr['value'])) {
			$database->beginTransaction();
			$database->query("UPDATE t_articles SET star_ind = '0' WHERE id = $arr[value]");
			$database->execute();
			$database->endTransaction();
			echo json_encode("done");
		}
	}

	//http POST http://RSSMonsterlocation/json.php jsonrpc="2.0" update="mark-all-as-read" -b
	//update read status for article
	if ($arr['update'] == "mark-all-as-read") {
		$database->beginTransaction();
		$database->query("UPDATE t_articles SET status = 'read'");
		$database->execute();
		$database->endTransaction();
		echo json_encode("done");
	}
}

//provide overview with feeds, e.g. names, categories, count unreaded number of articles
if(isset($arr['overview'])){

	//overview with all feeds
	if ($arr['overview'] == "feed") {
		$database->query("SELECT feed_name, count(*) AS count FROM t_articles t1 LEFT JOIN t_feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND t2.feed_name != '' GROUP BY feed_name ORDER BY feed_name");
		
		$rows = $database->resultset();
		
		if (!empty($rows)){
			echo json_encode($rows);	
		}
	}
	
	//overview with all categories
	if ($arr['overview'] == "category-detailed") {
		$database->query("SELECT a.id, category_name, COUNT(status) AS count_all, SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS count_unread
		FROM t_categories a
		INNER JOIN t_feeds b
		ON a.id = b.category_id
		LEFT JOIN t_articles c
		ON b.id = c.feed_id 
		GROUP BY category_id, category_name
		ORDER BY category_name");
		
		$rows = $database->resultset();
		
		if (!empty($rows)){
			echo json_encode($rows);	
		}
		
	}
	
	//overview with count for total, unread and starred
	if ($arr['overview'] == "status") {
		$database->query("SELECT COUNT(status) AS total, SUM(CASE WHEN status = 'unread' THEN 1 ELSE 0 END) AS unread, SUM(CASE WHEN star_ind = '1' THEN 1 ELSE 0 END) AS starred FROM t_articles");

		$row = $database->single();
		
		if (!empty($row)){
			echo json_encode($row);	
		}
		
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","delete": "feed", "value": "1"}' http://RSSMonsterlocation/json.php
//delete feed
if(isset($arr['delete'])){
	if ($arr['delete'] == "feed") {
		if (!empty($arr['value'])) {
			$database->beginTransaction();
			$database->query("DELETE FROM t_feeds WHERE id = $arr[value]");
			$database->execute();
			$database->query("DELETE FROM t_articles WHERE feed_id = $arr[value]");
			$database->execute();			
			$database->endTransaction();	
			echo json_encode("done");
		}
	}
}

?>
