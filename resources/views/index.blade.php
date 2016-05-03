@extends('layouts.master')
@section('content')

<div class="container" style="display: flex; height: 100%; -webkit-box-align: start; -webkit-align-items: flex-start; -ms-flex-align: start; align-items: flex-start; padding-right: 0px; padding-left: 0px;">
	<div class="column-left" style="-webkit-box-flex: 0; -webkit-flex-grow: 0; -ms-flex-positive: 0; flex-grow: 0; border-right: 1px solid transparent; border-color: #dcdee0; width: 245px; background-color: #eff1f3; height:100%; position: relative;">
		<div class="subscribe-toolbar" style="height: 41px; border-bottom: 1px solid transparent; border-color: #dcdee0; position: absolute; top: 0; left: 0; right: 0; overflow: hidden;">

		<form class="search-form-wrap" style="position: absolute; left: 0; right: 0; top: 0; margin: 0; border-bottom: 1px solid transparent; height: 41px;" data-behavior="search_form" action="index.php/api/feed/newrssfeed" accept-charset="UTF-8" data-remote="true" method="post" role="url"><input name="utf8" type="hidden" value="✓">
			<input type="text" name="url" style="color: #3399FF; height: 40px; width: 100%; max-width: 100%; margin: 0; padding: 4px 36px 3px 36px; font-size: 14px; background: url(https://dhy5vgj5baket.cloudfront.net/assets/favicon-search-light-ccdaa06e4a9effa94072d27ee7dc48b239aca8f60acf1abe08b87624db10ade1.svg) 14px 13px no-repeat; background-size: 14px 14px, 16px 16px; border-radius: 13px; border: none; line-height: 1; color: #212325;" id="query" placeholder="Subscribe" autocomplete="off"> 
		</form>
			
        </div>
		
		<div class="feeds-inner" style="position: absolute; top: 41px; bottom: 52px; left: 0; right: 0; z-index: 1; background-color: #eff1f3; -webkit-transition: -webkit-transform .2s ease; transition: -webkit-transform .2s ease; transition: transform .2s ease; transition: transform .2s ease, -webkit-transform .2s ease;"> 
			<div class="view-toolbar" style="display: -webkit-box; display: -webkit-flex; display: -ms-flexbox; display: flex; height: 41px; border-bottom: 1px solid transparent; border-color: #dcdee0; position: absolute; left: 0;  right: 0;">
				<a id="unread" class="view-button" style="-webkit-box-flex: 1; -webkit-flex: 1; -ms-flex: 1; flex: 1; text-align: center; line-height: 41px; height: 100%; text-decoration: none; display: block; font-size: 10px; text-transform: uppercase; font-weight: bold; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; border-left: 1px solid transparent; border-color: #dcdee0; color: #b4b6b8;" title="View unread" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true">Unread</a> 
				<a id="star" class="view-button" style="-webkit-box-flex: 1; -webkit-flex: 1; -ms-flex: 1; flex: 1; text-align: center; line-height: 41px; height: 100%; text-decoration: none; display: block; font-size: 10px; text-transform: uppercase; font-weight: bold; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; border-left: 1px solid transparent; border-color: #dcdee0; color: #b4b6b8;" title="View starred" data-behavior="view_starred change_view_mode" data-view-mode="view_starred" data-remote="true">Starred</a>
				<a id="read" class="view-button selected" style="-webkit-box-flex: 1; -webkit-flex: 1; -ms-flex: 1; flex: 1; text-align: center; line-height: 41px; height: 100%; text-decoration: none; display: block; font-size: 10px; text-transform: uppercase; font-weight: bold; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; border-left: 1px solid transparent; border-color: #dcdee0; color: #b4b6b8;" title="View all" data-behavior="view_all change_view_mode" data-view-mode="view_all" data-remote="true">Read</a>
			</div>
			<div class="feeds-droppable" style="background-color: #eff1f3; position: absolute; top: 41px; bottom: 0; left: 0; right: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch;">
				<div class="panel"></div>
			</div>
			
		</div>
		
		<div class="feeds-toolbar" style="border-top: 1px solid transparent; border-color: #dcdee0; position: absolute; z-index: 2; bottom: 0; left: 0; right: 0; font-size: 10px; background-color: #eff1f3;">  
			<table style="width: 100%;" cellpadding="0">
				<tbody>
				  <tr>
					<td style="width: 33%; text-align: center; vertical-align: middle;">
						<a id="delete" class="view-button" style="-webkit-box-flex: 1; -webkit-flex: 1; -ms-flex: 1; flex: 1; text-align: center; line-height: 41px; height: 100%; text-decoration: none; display: block; font-size: 10px; text-transform: uppercase; font-weight: bold; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; border-left: 1px solid transparent; border-color: #dcdee0; color: #b4b6b8;" title="Delete" data-behavior="view_unread change_view_mode" data-view-mode="view_unread" data-remote="true">Delete</a> 
					</td>
					<td style="width: 33%; text-align: center; vertical-align: middle;">
						<a id="mark-as-read" class="view-button" style="-webkit-box-flex: 1; -webkit-flex: 1; -ms-flex: 1; flex: 1; text-align: center; line-height: 41px; height: 100%; text-decoration: none; display: block; font-size: 10px; text-transform: uppercase; font-weight: bold; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; border-left: 1px solid transparent; border-color: #dcdee0; color: #b4b6b8;" title="Mark all as read" data-behavior="view_starred change_view_mode" data-view-mode="view_starred" data-remote="true">Read all</a>
					</td>
					<td style="width: 33%; text-align: center; vertical-align: middle;">
						<a id="add-new-category" class="view-button selected" style="-webkit-box-flex: 1; -webkit-flex: 1; -ms-flex: 1; flex: 1; text-align: center; line-height: 41px; height: 100%; text-decoration: none; display: block; font-size: 10px; text-transform: uppercase; font-weight: bold; -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none; border-left: 1px solid transparent; border-color: #dcdee0; color: #b4b6b8;" title="Add new" data-behavior="view_all change_view_mode" data-view-mode="view_all" data-remote="true">Add new</a>
					</td>
				  </tr>
				</tbody>
			  </table>
		</div>
		
	</div>

	<div class="column-center" style="-webkit-box-flex: 0; -webkit-flex-grow: 0; -ms-flex-positive: 0; flex-grow: 0; border-right: 1px solid transparent; border-color: #dcdee0; height:100%; position: relative;">
		<div class="mobile-top">
			<a style="color: #9d9d9d;" class="navbar-brand" id="unread" href="#"><span class="unread badge pull-right"></span>Unread</a>
			<a style="color: #9d9d9d;" class="navbar-brand" id="star" href="#"><span class="star badge pull-right">90</span>Saved</a>			
		</div>
		<form class="search-form-wrap" style="position: absolute; left: 0; right: 0; top: 0; margin: 0; border-bottom: 1px solid transparent; border-color: #dcdee0; background-color: #FFFFFF; height: 41px;" data-behavior="search_form" action="/entries/search" accept-charset="UTF-8" data-remote="true" method="get"><input name="utf8" type="hidden" value="✓">
			<input type="search" name="query" style="height: 41px; width: 100%; max-width: 100%; margin: 0; padding: 4px 36px 3px 36px; font-size: 14px; background: url(https://dhy5vgj5baket.cloudfront.net/assets/favicon-search-light-ccdaa06e4a9effa94072d27ee7dc48b239aca8f60acf1abe08b87624db10ade1.svg) 14px 13px no-repeat; background-size: 14px 14px, 16px 16px; border-radius: 13px; border: none; line-height: 1; color: #212325;" id="query" placeholder="Search" autocomplete="off"> 
		</form>
		<div id="section" style="position: absolute; bottom: 0; left: 0; right: 0; overflow-y: auto; overflow-x: hidden; -webkit-overflow-scrolling: touch; -webkit-transition: -webkit-transform .2s ease; transition: -webkit-transform .2s ease; transition: transform .2s ease; transition: transform .2s ease, -webkit-transform .2s ease; background-color: #FFFFFF;"></div>
	</div>
	<div class="column-right" style="-webkit-box-flex: 1; -webkit-flex-grow: 1; -ms-flex-positive: 1; flex-grow: 1; height: 100%; position: relative;">
	
	<div class="entry-toolbar" style="background-color: #FFFFFF; position: absolute; top: 0; left: 0; z-index: 3; width: 100%; height: 41px; border-bottom: 1px solid transparent; border-color: #dcdee0;"></div>
	<div class="entry-content" style="background-color: #FFFFFF; display: block; position: absolute; height: auto; bottom: 0; top: 41px; left: 0; right: 0; margin: 0; overflow-y: auto; overflow-x: hidden; -webkit-transition: top .2s ease; transition: top .2s ease; -webkit-overflow-scrolling: touch; z-index: 2;">
		<div class="entry-inner" style="padding: 40px 20px 40px 20px; margin: 0 auto; max-width: 660px; min-height: 100%;"></div>
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