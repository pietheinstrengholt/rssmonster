<!-- /resources/views/index.blade.php -->

<head>
	<meta charset="UTF-8">
	<title>RSSMonster</title>
	<style>
		body {
			margin: 0;
		}
	</style>

	<!-- CSS -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/3.3.7/css/bootstrap.min.css">
	<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/font-awesome/4.7.0/css/font-awesome.min.css">

	<!-- Configuring Web Applications -->
	<link rel="apple-touch-icon" sizes="57x57" href="http://localhost/rssmonster/public/img/favicon/apple-icon-57x57.png">
	<link rel="apple-touch-icon" sizes="60x60" href="http://localhost/rssmonster/public/favicon/apple-icon-60x60.png">
	<link rel="apple-touch-icon" sizes="72x72" href="http://localhost/rssmonster/public/favicon/apple-icon-72x72.png">
	<link rel="apple-touch-icon" sizes="76x76" href="http://localhost/rssmonster/public/favicon/apple-icon-76x76.png">
	<link rel="apple-touch-icon" sizes="114x114" href="http://localhost/rssmonster/public/favicon/apple-icon-114x114.png">
	<link rel="apple-touch-icon" sizes="120x120" href="http://localhost/rssmonster/public/favicon/apple-icon-120x120.png">
	<link rel="apple-touch-icon" sizes="144x144" href="http://localhost/rssmonster/public/favicon/apple-icon-144x144.png">
	<link rel="apple-touch-icon" sizes="152x152" href="http://localhost/rssmonster/public/favicon/apple-icon-152x152.png">
	<link rel="apple-touch-icon" sizes="180x180" href="http://localhost/rssmonster/public/favicon/apple-icon-180x180.png">
	<link rel="icon" type="image/png" sizes="192x192"	href="http://localhost/rssmonster/public/favicon/android-icon-192x192.png">
	<link rel="icon" type="image/png" sizes="32x32" href="http://localhost/rssmonster/public/favicon/favicon-32x32.png">
	<link rel="icon" type="image/png" sizes="96x96" href="http://localhost/rssmonster/public/favicon/favicon-96x96.png">
	<link rel="icon" type="image/png" sizes="16x16" href="http://localhost/rssmonster/public/favicon/favicon-16x16.png">
	<meta name="msapplication-TileColor" content="#ffffff">
	<meta name="msapplication-TileImage" content="http://localhost/rssmonster/public/img/favicon/ms-icon-144x144.png">
	<meta name="theme-color" content="#ffffff">
	<meta name="apple-mobile-web-app-capable" content="yes" />
</head>

<div id="app">
	<div class="row" style="margin-right:0px;">
		<div class="sidebar col-md-2" style="position:fixed">
			<app-quickbar></app-quickbar>
			<app-sidebar></app-sidebar>
		</div>
		<div class="home col-md-10 col-md-offset-2">
			<app-quickbar></app-quickbar>
			<app-home></app-home>
		</div>
	</div>
</div>

<!-- JavaScripts -->
<script src="{{ URL::asset('js/main.js') }}"></script>
