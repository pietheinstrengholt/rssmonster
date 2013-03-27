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
if ($arr[jsonrpc] != "2.0") { 
  echo json_encode($error);
  //exit;
 }

//debug message
if ($arr[request] == "debug") { 
  echo json_encode($debug);
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","request": "read-status", "value": "1"}' http://openreaderurl/json.php
if ($arr[request] == "read-status") {
  $sql = "SELECT status from articles WHERE id = $arr[value]";
  $result = mysql_query($sql);
  echo json_encode(mysql_result($result,0));
}

if ($arr[request] == "read-content") {
  $sql = "SELECT content from articles WHERE id = $arr[value]";
  $result = mysql_query($sql);
  echo json_encode(mysql_result($result,0));
}

//usage curl -X POST -H 'Content-Type: application/json; charset=utf-8' -d '{"jsonrpc": "2.0","update": "read-status", "value": "1"}' http://openreaderurl/json.php
if ($arr[update] == "read-status") {
  $sql = "UPDATE articles set status = 'read' WHERE id = $arr[value]";
  $result = mysql_query($sql);
  echo json_encode("done");
}

if ($arr[update] == "mark-all-as-read") {
  //$sql = "UPDATE articles set status = 'read'";
  //$result = mysql_query($sql);
  echo json_encode("done");
}


mysql_close($con);

?>
