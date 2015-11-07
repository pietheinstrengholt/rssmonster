@extends('layouts.master')

@section('content')

<div class="row">
  <div class="visble-lg col-lg-2">
    <div id="buttons-top" class="btn-group btn-group-sm" role="group">
      <button id="unread" style="width:33%" type="button" class="btn btn-default">
        <span class="glyphicon glyphicon-eye-open" aria-hidden="true"></span> Unread
      </button>
      <button id="star" style="width:34%" type="button" class="btn btn-default">
        <span class="glyphicon glyphicon-star" aria-hidden="true"></span> Star
      </button>
      <button id="read" style="width:33%" type="button" class="btn btn-default">
        <span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Read
      </button>
    </div>
    <div class="panel"></div>
    <div id="buttons-bottom" class="btn-group btn-group-sm" role="group">
      <button id="delete" style="width:33%" type="button" class="btn btn-default">
        <span class="glyphicon glyphicon-eye-open" aria-hidden="true"></span> Delete
      </button>
      <button id="mark-as-read" style="width:34%" type="button" class="btn btn-default">
        <span class="glyphicon glyphicon-star" aria-hidden="true"></span> All seen
      </button>
      <button id="new" style="width:33%" type="button" class="btn btn-default">
        <span class="glyphicon glyphicon-ok" aria-hidden="true"></span> Add new
      </button>
    </div>
  </div>
  <div class="col-12 col-sm-12 col-lg-10">
    <section></section>
  </div>
</div>

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
