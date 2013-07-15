<?php

//usage: curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "debug"}' http://openreaderurl/json.php
//usage: http POST http://openreaderurl/json.php jsonrpc="2.0" request="debug" -b

include 'config.php';

//debugging and error message
$debug = array('a' => 1, 'b' => 2, 'c' => 3, 'd' => 4, 'e' => 5);
$error = array('response'=>"Incorrect JSON message");

//header type is json
header('Content-Type: application/json');
$arr = json_decode(file_get_contents('php://input'), true);

//if json argument isn't given exit
if ($arr['jsonrpc'] != "2.0") { 
  echo json_encode($error);
  //exit;
}

if(!isset($arr['sort'])){
  $sort = 'desc';
} else {
  $sort = $arr['sort'];
}

//update feedname or feed category
if(isset($arr['update'])){
	if ($arr['update'] == "feeds") {
	  if (empty($arr[value])) {
		exit;
	  } 
	  else if (empty($arr[new_feed_name]) && empty($arr[new_feed_category])) {
		exit;
	  } 
	  else {
		//TODO: new_feed_category needs to be converted to an ID instead of a name
		$sql = "UPDATE feeds set name='$arr[new_feed_name]',category='$arr[new_feed_category]' WHERE id = $arr[value]";
		$result = mysql_query($sql);
		echo json_encode("done");
	  }
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "read-status", "value": "1"}' http://openreaderurl/json.php
//get article status, read or unread
if(isset($arr['request'])){

	if ($arr['request'] == "debug") { 
	  echo json_encode($debug);
	}

	//get overview with all feeds, sorted by name
	if ($arr['request'] == "get-feeds") {
	  $sql=mysql_query("SELECT a.name, a.id, a.url, b.name as category FROM feeds a LEFT JOIN category b ON a.category = b.id ORDER BY a.name");
	  while($r[]=mysql_fetch_array($sql));
	  echo json_encode($r);
	}

	if ($arr['request'] == "read-status") {
	  $sql = "SELECT status from articles WHERE id = $arr[value]";
	  $result = mysql_query($sql);
	  echo json_encode(mysql_result($result,0));
	}

	//get article content
	if ($arr['request'] == "read-content") {
	  $sql = "SELECT content from articles WHERE id = $arr[value]";
	  $result = mysql_query($sql);
	  echo json_encode(mysql_result($result,0));
	}
	
	//http POST http://192.168.0.111/phppaper/json.php jsonrpc="2.0" request="get-articles" offset="0" postnumbers="10" -b
	//get article content and other information
	if ($arr['request'] == "get-articles") {

	  if (empty($arr['status'])) {
		$status = 'unread';
	  } else {
		$status = $arr['status'];
	  }

	  //article id is filled in
	  if (!empty($arr['article_id'])) {
		$sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.id = '$arr[article_id]'");
	  //per feed
	  } elseif (!empty($arr['input_feed']) && empty($arr['input_category'])) {
		$sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE status = '$status' AND feed_id = (SELECT id FROM `feeds` WHERE name = '$arr[input_feed]') ORDER BY 
publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
	  //per category
	  } elseif (!empty($arr['input_category']) && empty($arr['input_feed'])) {
		$sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.status = '$status' AND feed_id in (SELECT id FROM `feeds` WHERE category = '$arr[input_category]') ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
	  //last unread 25 or 50
	  } else {
		if ($status == 'starred') {
		  $sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.star_ind = '1' ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
		} else if (urldecode($status) == 'last 24 hours') {
		  $sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND publish_date between (NOW() - INTERVAL 1 DAY) AND NOW() ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
		} else if (urldecode($status) == 'last hour') {
		  $sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND publish_date between (NOW() - INTERVAL 1 HOUR) AND NOW() ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
		} else {
		  $sql=mysql_query("SELECT t1.id, status, t1.url, subject, content, publish_date, name as feed_name, category, star_ind, author FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.status = '$status' ORDER BY publish_date $sort LIMIT $arr[offset], $arr[postnumbers]");
		}
	  }
	  while($r[]=mysql_fetch_array($sql));
	  $r = array_filter($r);

	  if (empty($r)) {
		echo json_encode("no-results");
	  } else {
		echo json_encode($r);
	  }
	}	
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "read-status", "value": "1"}' http://openreaderurl/json.php
//update read status and return url as success value
if(isset($arr['update'])){

	if ($arr['update'] == "read-status") {
	  $sql = "UPDATE articles set status = 'read' WHERE id = $arr[value]";
	  $result = mysql_query($sql);
	  $response = "SELECT url FROM articles WHERE id = $arr[value]";
	  $r = mysql_query($response);
	  echo json_encode(mysql_result($r,0));
	}

	//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "star-mark", "value": "1"}' http://openreaderurl/json.php
	//update article to mark as star or unstar
	if ($arr['update'] == "star-mark") {
	  $sql = "UPDATE articles set star_ind = '1' WHERE id = $arr[value]";
	  $result = mysql_query($sql);
	  echo json_encode("done");
	} elseif ($arr['update'] == "star-unmark") {
	  $sql = "UPDATE articles set star_ind = '0' WHERE id = $arr[value]";
	  $result = mysql_query($sql);
	  echo json_encode("done");
	}

	//http POST http://192.168.0.111/phppaper/json.php jsonrpc="2.0" update="mark-as-read" -b
	//update read status for article
	if ($arr['update'] == "mark-as-read" && $arr[status] != 'starred' && $arr[status] != 'read') {
	  if (!empty($arr[value])) {
		$sql = "UPDATE articles set status = 'read' WHERE id in ($arr[value])";
	  //mark a feed as read
	  } elseif (!empty($arr[input_feed]) && empty($arr[input_category])) {
		$sql = "UPDATE articles set status = 'read' WHERE feed_id = (SELECT id FROM `feeds` WHERE name = '$arr[input_feed]')";
	  //mark a category as read
	  } elseif (!empty($arr[input_category]) && empty($arr[input_feed])) {
		$sql = "UPDATE articles set status = 'read' WHERE feed_id in (SELECT id FROM `feeds` WHERE category = '$arr[input_category]')";
	  //set all items to read
	  } elseif ($arr[status] == 'unread' || empty($arr[status])) {
		$sql = "UPDATE articles set status = 'read'";
	  }
	  $result = mysql_query($sql);
	  echo json_encode("done");
	}

	//update unread status for article
        if ($arr['update'] == "mark-as-unread" && $arr[status] != 'starred' && $arr[status] != 'read') {
          if (!empty($arr[value])) {
                $sql = "UPDATE articles set status = 'unread' WHERE id in ($arr[value])";
          }
          $result = mysql_query($sql);
          echo json_encode("done");
        }
}

//provide overview with feeds, e.g. names, categories, count unreaded number of articles
if(isset($arr['overview'])){
	if ($arr['overview'] == "feed") {
	  $sql=mysql_query("SELECT name, count(*) as count FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE t1.status = 'unread' AND t2.name != '' GROUP BY name ORDER BY name");
	  while($r[]=mysql_fetch_array($sql));
	  echo json_encode($r);
	} elseif ($arr['overview'] == "category") {
	  $sql=mysql_query("SELECT category as name, count(*) as count FROM articles t1 LEFT JOIN feeds t2 ON t1.feed_id = t2.id WHERE category <> '' AND status = 'unread' GROUP BY category ORDER BY category");
	  while($r[]=mysql_fetch_array($sql));
	  echo json_encode($r); 
	} elseif ($arr['overview'] == "category-detailed") {
	  $sql=mysql_query("SELECT t1.name as category, IFNULL(count_all,0) as count_all, IFNULL(count_unread,0) as count_unread FROM

  (SELECT count(*) as count_all, c.name FROM `articles` a
  LEFT JOIN feeds b
  on a.feed_id = b.id
  LEFT JOIN category c
  on b.category = c.id
  GROUP BY category) t1

LEFT JOIN

  (SELECT count(*) as count_unread, c.name FROM `articles` a
  LEFT JOIN feeds b
  on a.feed_id = b.id
  LEFT JOIN category c
  on b.category = c.id
  WHERE a.status = 'unread'
  GROUP BY category) t2

ON t1.name = t2.name
ORDER BY t1.name");
	  while($r[]=mysql_fetch_array($sql));
	  echo json_encode($r);
	} elseif ($arr['overview'] == "status") {
	  $sql=mysql_query("select name, count from (select status as name, count(*) as count from articles GROUP BY status ORDER BY status DESC) a
						union
						select name, count from (select 'starred' as name, count(*) as count from articles where star_ind = '1') b
				union
				select name, count from (select 'last 24 hours' as name, count(*) as count from articles where status = 'unread' and publish_date between (NOW() - INTERVAL 1 DAY) AND NOW()) c
						union
						select name, count from (select 'last hour' as name, count(*) as count from articles where status = 'unread' and publish_date between (NOW() - INTERVAL 1 HOUR) AND NOW()) d
				");
	  while($r[]=mysql_fetch_array($sql));
	  echo json_encode($r);
	}
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","delete": "feed", "value": "1"}' http://openreaderurl/json.php
//delete feed
if(isset($arr['delete'])){
	if ($arr['delete'] == "feed") {
	  $sql = "DELETE from feeds WHERE id = $arr[value]";
	  $result = mysql_query($sql);
	  echo json_encode("done");
	}
}

//mysql_close();

?>
