<!DOCTYPE html>
<html>
<head>
	@section('head')
	<title>
	@section('title')
	RSS Monster
	@show
	</title>

	<!-- CSS -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<link rel="stylesheet" href="{{ URL::asset('css/bootstrap.min.css') }}">
	<link rel="stylesheet" href="{{ URL::asset('css/styles.css') }}">
	<style type="text/css">
		html,body
		{
			overflow-x: hidden;
		}
		body {
			padding-top: 60px;
			padding-bottom: 40px;
		}
		.sidebar-nav {
			padding: 9px 0;
		}
		@media (max-width: 980px) {
			/* Enable use of floated navbar text */
			padding-top: 0px;
			.navbar-text.pull-right {
				float: none;
				padding-left: 5px;
				padding-right: 5px;
			}
		}
	</style>
	
	<!-- Configuring Web Applications -->	
	<link rel="apple-touch-icon" sizes="57x57" href="{{ URL::asset('img/favicon/apple-icon-57x57.png') }}">
	<link rel="apple-touch-icon" sizes="60x60" href="{{ URL::asset('img/favicon/apple-icon-60x60.png') }}">
	<link rel="apple-touch-icon" sizes="72x72" href="{{ URL::asset('img/favicon/apple-icon-72x72.png') }}">
	<link rel="apple-touch-icon" sizes="76x76" href="{{ URL::asset('img/favicon/apple-icon-76x76.png') }}">
	<link rel="apple-touch-icon" sizes="114x114" href="{{ URL::asset('img/favicon/apple-icon-114x114.png') }}">
	<link rel="apple-touch-icon" sizes="120x120" href="{{ URL::asset('img/favicon/apple-icon-120x120.png') }}">
	<link rel="apple-touch-icon" sizes="144x144" href="{{ URL::asset('img/favicon/apple-icon-144x144.png') }}">
	<link rel="apple-touch-icon" sizes="152x152" href="{{ URL::asset('img/favicon/apple-icon-152x152.png') }}">
	<link rel="apple-touch-icon" sizes="180x180" href="{{ URL::asset('img/favicon/apple-icon-180x180.png') }}">
	<link rel="icon" type="image/png" sizes="192x192"  href="{{ URL::asset('img/favicon/android-icon-192x192.png') }}">
	<link rel="icon" type="image/png" sizes="32x32" href="{{ URL::asset('img/favicon/favicon-32x32.png') }}">
	<link rel="icon" type="image/png" sizes="96x96" href="{{ URL::asset('img/favicon/favicon-96x96.png') }}">
	<link rel="icon" type="image/png" sizes="16x16" href="{{ URL::asset('img/favicon/favicon-16x16.png') }}">
	<link rel="manifest" href="{{ URL::asset('img/favicon/manifest.json') }}">
	<meta name="msapplication-TileColor" content="#ffffff">
	<meta name="msapplication-TileImage" content="{{ URL::asset('img/favicon/ms-icon-144x144.png') }}">
	<meta name="theme-color" content="#ffffff">
	@show
</head>

<div class="navbar navbar-fixed-top navbar-inverse">
	<div class="container">

		<!-- Brand and toggle get grouped for better mobile display -->
		<div class="navbar-header">
			<button type="button" class="navbar-toggle" data-toggle="collapse" data-target="#bs-example-navbar-collapse-1">
			<span class="sr-only">Toggle navigation</span>
			<span class="icon-bar"></span>
			<span class="icon-bar"></span>
			<span class="icon-bar"></span>
			</button>
			<a class="navbar-brand" id="home" href="{{ URL::asset('index.php') }}">Home</a>
			<a class="navbar-brand" id="unread" href="#"><span class="unread badge pull-right"></span>Unread</a>
			<a class="navbar-brand" id="star" href="#"><span class="star badge pull-right"></span>Saved</a>
		</div>

		<!-- Collect the nav links, forms, and other content for toggling -->
		<div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">
			<ul class="nav navbar-nav">
				<li class="dropdown">
				<a id="drop1" href="#" role="button" class="dropdown-toggle" data-toggle="dropdown">Views<b class="caret"></b></a>
				<ul class="dropdown-menu" role="menu" aria-labelledby="drop1">
					<li role="presentation"><a class="view-type" id="detailed" role="menuitem" tabindex="-1" href="#">Detailed view</a></li>
					<li role="presentation"><a class="view-type" id="list" role="menuitem" tabindex="-1" href="#">List view</a></li>
					<li role="presentation"><a class="view-type" id="minimal" role="menuitem" tabindex="-1" href="#">Minimal view</a></li>
				</ul>
				</li>
			</ul>

			<ul class="nav navbar-nav">
				<li class="dropdown">
				<a id="drop1" href="#" role="button" class="dropdown-toggle" data-toggle="dropdown">Sort<b class="caret"></b></a>
				<ul class="dropdown-menu" role="menu" aria-labelledby="drop1">
					<li role="presentation"><a class="sort-order" id="asc" role="menuitem" tabindex="-1" href="#">Oldest first</a></li>
					<li role="presentation"><a class="sort-order" id="desc" role="menuitem" tabindex="-1" href="#">Newest first</a></li>
				</ul>
				</li>
			</ul>

			<form action="index.php/api/feed/newrssfeed" method="post" class="navbar-form navbar-left" role="url">
				<div class="form-group">
					<input name="url" type="text" placeholder="Add feed or url"  style="width: 120px;" class="form-control">
				</div>
				<button id="submit" class="btn btn-default">Submit</button>
			</form>
			
			<ul class="nav navbar-nav">
				<li class="dropdown">
				<a id="drop1" href="#" role="button" class="dropdown-toggle" data-toggle="dropdown">Options<b class="caret"></b></a>
				<ul class="dropdown-menu" role="menu" aria-labelledby="drop1">
					<li role="presentation"><a class="update" href="#" role="menuitem" tabindex="-1" href="#">Update</a></li>
					<li role="presentation"><a class="managefeeds" href="#" role="menuitem" tabindex="-1" href="#">Manage feeds</a></li>
				</ul>
				</li>
			</ul>

		</div><!-- /.nav-collapse -->

	</div><!-- /.container -->
	</div><!-- /.navbar -->

	<body>
	<!-- Container -->
	<div class="container">

	<!-- Content -->
	@yield('content')

	</div>

	@section('footer_scripts')
	<!-- External scripts are placed here -->
	<script src="{{ URL::asset('js/jquery-1.11.3.min.js') }}"></script>
	<script src="{{ URL::asset('js/jquery-ui-1.11.4.custom.min.js') }}"></script>
	<script src="{{ URL::asset('js/bootstrap.min.js') }}"></script>
	<script src="{{ URL::asset('js/waypoints.js') }}"></script>
	<!-- App script is placed here -->	
	<script src="{{ URL::asset('js/app.js') }}"></script>
	<!-- Add Internet Explorer console log function -->
	<script type="text/javascript"> if (!window.console) console = {log: function() {}}; </script>
	@show

    </body>
</html>
