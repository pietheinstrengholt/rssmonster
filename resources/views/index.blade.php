@extends('layouts.master')
@section('content')

<div class="row">
   <!-- show sidebar and option to only show on large devices -->
   <div class="visible-lg col-lg-2">
      <!-- show unread, star and read buttons -->
      <div id="buttons-top" class="btn-group btn-group-sm" role="group">
         <button id="unread" style="width:33%;" type="button" class="btn btn-default">
         <span class="glyphicon glyphicon-eye-open" aria-hidden="true"></span> Unread</button>
         <button id="star" style="width:34%;" type="button" class="btn btn-default">
         <span class="glyphicon glyphicon-star" aria-hidden="true"></span> Star</button>
         <button id="read" style="width:33%;" type="button" class="btn btn-default">
         <span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Read</button>
      </div>
      <!-- show empty panel, which will be deployed by the rssmonster.js -->
      <div class="panel"></div>
      <!-- show delete, mark as read and new buttons -->
      <div id="buttons-bottom" class="btn-group btn-group-sm" role="group">
         <button id="delete" style="width:33%;" type="button" class="btn btn-default">
         <span class="glyphicon glyphicon-trash" aria-hidden="true"></span> Delete</button>
         <button id="mark-as-read" style="width:34%;" type="button" class="btn btn-default">
         <span class="glyphicon glyphicon-ok-sign" aria-hidden="true"></span> All seen</button>
         <button id="new" style="width:33%;" type="button" class="btn btn-default">
         <span class="glyphicon glyphicon-pencil" aria-hidden="true"></span> Add new</button>
      </div>
      <!-- end of left sidebar -->
   </div>
   <!-- section is always displayed, also on smart phones and tablets -->
   <div class="col-12 col-sm-12 col-lg-10">
      <!-- show empty section, which will be deployed by the app.js -->
      <section></section>
   </div>
</div>

<!-- html for modal pop-up message -->
<div id="modal" class="modal fade">
   <div class="modal-dialog">
      <div class="modal-content">
         <div class="modal-header">
            <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            <h4 class="modal-title">Modal title</h4>
         </div>
         <div class="modal-body">
            <p></p>
         </div>
         <div class="modal-footer">
            <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
            <button type="button" class="btn btn-primary">Submit</button>
         </div>
      </div>
      <!-- /.modal-content -->
   </div>
   <!-- /.modal-dialog -->
</div>
<!-- /.modal -->
<!-- end html modal pop-up message -->

@stop