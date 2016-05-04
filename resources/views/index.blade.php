@extends('layouts.master')
@section('content')

<div class="container">
	<div class="column-left">
		<div class="subscribe-toolbar">

		<form class="search-form-wrap" data-behavior="search_form" action="index.php/api/feed/newrssfeed" accept-charset="UTF-8" data-remote="true" method="post" role="url"><input name="utf8" type="hidden" value="✓">
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

	<div class="column-center">
		<div class="mobile-top">
			<a class="navbar-brand" id="unread" href="#"><span class="unread badge pull-right"></span>Unread</a>
			<a class="navbar-brand" id="star" href="#"><span class="star badge pull-right">90</span>Saved</a>			
		</div>
		<div class="search-form-wrap" data-behavior="search_form" accept-charset="UTF-8" data-remote="true" method="get">
			<input type="search" id="search-field" placeholder="Search" autocomplete="off"> 
		</div>
		<div id="section"></div>
	</div>
	<div class="column-right">
	
	<div class="entry-toolbar">
	
		<span class="site-info">
			<span class="favicon-wrap">
				<span class="favicon"></span>
			</span>
			<a class="entry-feed-title"></a>
		</span>
		
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
	<div class="entry-content">
		<div class="entry-inner"></div>
	</div>
	
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