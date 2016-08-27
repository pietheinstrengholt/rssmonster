<form class="form-inline">
<div style="margin-top: 10px; margin-left:10px; margin-right:10px;" class="table-responsive">
<table class="table table-hover table-bordered table-condensed">

<tr class="warning">
<th width="10%">ID</th>
<th width="45%">Feed name</th>
<th width="30%">Category</th>
<th width="15%">Delete</th>
</tr>

@foreach( $feeds as $feed )
	<input name="[{{ $feed->id }}][feed_id]" type="hidden" value="{{ $feed->id }}">
	<tr>
	<td>
	<span>{{ $feed->id }}</span>
	</td>

	<td>
	<div style="width:100%" class="form-group">
	<input name="[{{ $feed->id }}][feed_name]" style="width:100%" type="text" class="form-control" id="exampleInputName2" value="{{ $feed->feed_name }}" placeholder="{{ $feed->feed_name }}">
	</div>
	</td>

	<td>
	<div style="width:100%" class="form-group">
	<select name="[{{ $feed->id }}][category_id]" style="width:100%" class="form-control">
		@foreach ($categories as $category)
			@if ($feed->category_id == $category->id)
				<option selected="selected" value="{{ $feed->category->id }}">{{ $category->name }}</option>
			@else
				<option value="{{ $feed->category->id }}">{{ $category->name }}</option>
			@endif
		@endforeach
	</select>
	</div>
	</td>

	<td>
	<div class="checkbox">
	<label>
	<input name="[{{ $feed->id }}][delete]" type="checkbox"> Delete
	</label>
	</div>
	</td>

	</tr>
@endforeach

</table>
</div>
</form>
<button class="btn btn-primary" id="submit-feedchanges" name="formSubmit" value="Submit" type="submit">Submit</button>
