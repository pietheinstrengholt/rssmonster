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
	<meta name="base_url" content="{{ URL::to('/') }}">
	<link rel="stylesheet" href="{{ URL::asset('css/bootstrap.min.css') }}">
	<link rel="stylesheet" href="{{ URL::asset('css/app.css') }}">
	
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

<body>

<!-- Content -->
@yield('content')

@section('footer_scripts')
<!-- External scripts are placed here -->
<script src="{{ URL::asset('js/jquery-1.11.3.min.js') }}"></script>
<script src="{{ URL::asset('js/jquery-ui-1.11.4.custom.min.js') }}"></script>
<script src="{{ URL::asset('js/bootstrap.min.js') }}"></script>
<script src="{{ URL::asset('js/jquery.waypoints.js') }}"></script>
<!-- App script is placed here -->	
<script src="{{ URL::asset('js/app.js') }}"></script>
<!-- Add Internet Explorer console log function -->
<script type="text/javascript"> if (!window.console) console = {log: function() {}}; </script>
@show

</body>
</html>
