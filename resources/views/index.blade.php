@extends('layouts.master')
@section('content')

<div class="container">
	<div class="column-left ui-resizable">
		<div class="subscribe-toolbar">

		<form class="new-form-wrap" data-behavior="search_form" action="index.php/api/feed/newrssfeed" accept-charset="UTF-8" data-remote="true" method="post" role="url"><input name="utf8" type="hidden" value="✓">
			<input type="text" name="url" id="query" placeholder="Subscribe" autocomplete="off">
		</form>

        </div>

		<div class="feeds-inner">
			<div class="view-toolbar">
				<a id="unread" class="view-button" title="View unread" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true">Unread</a>
				<a id="star" class="view-button" title="View starred" data-behavior="view_starred change_view_mode" data-view-mode="view_starred" data-remote="true">Starred</a>
				<a id="read" class="view-button selected" title="View all" data-behavior="view_all change_view_mode" data-view-mode="view_all" data-remote="true">Read</a>
			</div>
			<div class="feeds-droppable">
				<div class="panel"></div>
			</div>

		</div>

		<div class="feeds-toolbar">
			<table cellpadding="0">
				<tbody>
				  <tr>
					<td>
						<a id="delete" class="view-button" title="Delete" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true">Delete</a>
					</td>
					<td>
						<a id="mark-as-read" class="view-button" title="Mark all as read" data-behavior="view_starred change_view_mode" data-view-mode="view_starred" data-remote="true">Read all</a>
					</td>
					<td>
						<a id="add-new-category" class="view-button selected" title="Add new" data-behavior="view_all change_view_mode" data-view-mode="view_all" data-remote="true">Add new</a>
					</td>
				  </tr>
				</tbody>
			  </table>
		</div>

	</div>

	<div class="column-right ui-resizable">
		<div class="mobile-top">
			<div class="navbar navbar-fixed-top navbar-inverse">
				<div class="container">

					<!-- Brand and toggle get grouped for better mobile display -->
					<div class="navbar-header">
						<button type="button" class="navbar-toggle collapsed" data-toggle="collapse" data-target="#bs-example-navbar-collapse-1" aria-expanded="false">
						<span class="sr-only">Toggle navigation</span>
						<span class="icon-bar"></span>
						<span class="icon-bar"></span>
						<span class="icon-bar"></span>
						</button>
						<a class="navbar-brand" id="unread" href="#"><span class="unread badge pull-right">0</span>Unread</a>
						<a class="navbar-brand" id="star" href="#"><span class="star badge pull-right">109</span>Saved</a>
					</div>
				</div><!-- /.container -->
			</div>
		</div>
		<div class="search-form-wrap" data-behavior="search_form" accept-charset="UTF-8" data-remote="true" method="get">
			<input type="search" id="search-field" placeholder="Search" autocomplete="off">
		</div>
		<div class="entry-toolbar">

			<div class="entry-buttons">

				<div class="entry-button-wrap">
					<div class="entry-button">
						<div class="hamburger-menu-wrap" data-behavior="toggle_dropdown" title="Settings">
							<div class="hamburger-menu"></div>
						</div>
					</div>
				</div>

				<div class="entry-button-wrap invisible circle">
					<button class="entry-button button-toggle-read" title="Mark as read/unread">
						  <span class="circle unread"></span>
					</button>
				</div>
			</div>

		</div>
		<div id="section"></div>
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

<!-- html for settings modal pop-up message -->
<div id="modal-settings" class="modal fade">
   <div class="modal-dialog">
      <div class="modal-content">
         <div class="modal-header">
            <button type="button" class="close" data-dismiss="modal" aria-label="Close"><span aria-hidden="true">&times;</span></button>
            <h4 class="modal-title">Modal title</h4>
         </div>
         <div class="modal-body">
			<div id="page-content1" class="row-flex row-flex-wrap row row-eq-height">
				<div class="col-md-3 col-sm-6 hero-feature">
					<div class="well">
						<div class="caption" style="padding:0px;">
							<div class="clearfix"></div>
							<div class="content-container">
								<h3 class="center">Add new feed</h3>
								<p class="center">Add a new feed or category.</p>
								<p class="p-more-info">
								<a id="addnew-feed" href="#" class="btn btn-warning">Click here</a>
								</p>
								<div class="clearfix"></div>
							</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6 hero-feature">
					<div class="well">
						<div class="caption" style="padding:0px;">
						<div class="clearfix"></div>
						<div class="content-container">
							<h3 class="center">Manage feeds</h3>
							<p class="center">Rename, remove feeds or change the category of a feed.</p>
							<p class="p-more-info">
							<a id="manage-feeds" href="#" class="btn btn-danger">Click here</a>
							</p>
							<div class="clearfix"></div>
						</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6 hero-feature">
					<div class="well">
						<div class="caption" style="padding:0px;">
							<div class="clearfix"></div>
							<div class="content-container">
								<h3 class="center">Update articles</h3>
								<p class="center">Start processing the retrieval of new articles.</p>
								<p class="p-more-info">
								<a id="update-feeds" href="#" class="btn btn-primary">Click here</a>
								</p>
								<div class="clearfix"></div>
							</div>
						</div>
					</div>
				</div>
				<div class="col-md-3 col-sm-6 hero-feature">
					<div class="well">
						<div class="caption" style="padding:0px;">
							<div class="clearfix"></div>
							<div class="content-container">
								<h3 class="center">Settings page</h3>
								<p class="center">Change the sort order of articles and other settings.</p>
								<p class="p-more-info">
								<a id="settings-page" href="#" class="btn btn-success">Click here</a>
								</p>
								<div class="clearfix"></div>
							</div>
						</div>
					</div>
				</div>
			</div>
         </div>
         <div class="modal-footer">
            <button type="button" class="btn btn-default" data-dismiss="modal">Close</button>
         </div>
      </div>
      <!-- /.modal-content -->
   </div>
   <!-- /.modal-dialog -->
</div>
<!-- /.modal -->
<!-- end html modal pop-up message -->

@stop
