<form class="form-inline">
<div id="settings-page" style="padding:20px;">
	<h2>Settings</h2>
	<h4>Manage configuration settings</h4>

	<h5><label for="usr">Sortorder:</label></h5>
	<select name="sort_order" class="form-control" style="width: 200px; margin-top: -10px;" id="visible">
		@if (empty($config_array['sort_order']))
			<option value="asc">Ascending</option>
			<option value="desc">Descending</option>
		@else
			@if ($config_array['sort_order'] == "asc")
				<option value="asc" selected="selected">Ascending</option>
			@else
				<option value="asc">Ascending</option>
			@endif
			@if ($config_array['sort_order'] == "desc")
				<option value="desc" selected="selected">Descending</option>
			@else
				<option value="desc">Descending</option>
			@endif
		@endif
	</select>
</div>
</form>
<button id="settings-submit" style="margin-left:20px; margin-top:20px;" type="submit" class="btn btn-primary">Submit new settings</button>
