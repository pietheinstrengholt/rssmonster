@extends('layouts.master')

@section('content')

<?php

echo "<div class=\"row\">";
echo "<div class=\"visible-lg col-lg-2\">";

// url variables
$url = 'http://' . $_SERVER['HTTP_HOST'] . dirname($_SERVER['PHP_SELF']);
$url = preg_replace('/\s+/', '', $url);

//show unread, star and read buttons
echo "<div id=\"buttons-top\" class=\"btn-group btn-group-sm\" role=\"group\">";
echo "<button id=\"unread\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-eye-open\" aria-hidden=\"true\"></span> Unread</button>";
echo "<button id=\"star\" style=\"width:34%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-star\" aria-hidden=\"true\"></span> Star</button>";
echo "<button id=\"read\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-ok\" aria-hidden=\"true\"></span> Read</button>";
echo "</div>";

//show empty panel, which will be deployed by the rssmonster.js
echo "<div class=\"panel\"></div>";

//show delete, mark as read and new buttons
echo "<div id=\"buttons-bottom\" class=\"btn-group btn-group-sm\" role=\"group\">";
echo "<button id=\"delete\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-trash\" aria-hidden=\"true\"></span> Delete</button>";
echo "<button id=\"mark-as-read\" style=\"width:34%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-ok-sign\" aria-hidden=\"true\"></span> All seen</button>";
echo "<button id=\"new\" style=\"width:33%;\" type=\"button\" class=\"btn btn-default\">";
echo "<span class=\"glyphicon glyphicon-pencil\" aria-hidden=\"true\"></span> Add new</button>";
echo "</div>";

echo "</div>";
echo "<div class=\"col-12 col-sm-12 col-lg-10\">";

//show empty section, which will be deployed by the rssmonster.js
echo "<section></section>";
echo "</div>";
echo "</div>";

?>

<!-- HTML NEEDED FOR THE IMPORTANT MESSAGE MODAL POPUP -->
<div id="modal" class="modal fade">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
        <h4 class="modal-title">Modal title</h4>
      </div>
      <div class="modal-body">
        <p>One fine body&hellip;</p>
      </div>
      <div class="modal-footer">
        <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
        <button type="button" class="btn btn-primary">Submit</button>
      </div>
    </div><!-- /.modal-content -->
  </div><!-- /.modal-dialog -->
</div><!-- /.modal -->
<!-- END HTML NEEDED FOR THE IMPORTANT MESSAGE MODAL POPUP -->

@stop
