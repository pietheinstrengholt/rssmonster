<!-- /resources/views/index.blade.php -->

<head>
	<meta charset="UTF-8">
	<title>RSSMonster</title>
	<style>
		body {
			margin: 0;
		}
	</style>

	<!-- Meta base url, needed for javascript location -->
	<meta name="base_url" content="{{ URL::to('/') }}">

	<!-- CSS -->
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<meta http-equiv="X-UA-Compatible" content="IE=edge">
	<link rel="stylesheet" href="https://maxcdn.bootstrapcdn.com/bootstrap/4.0.0-beta.3/css/bootstrap.min.css" integrity="sha384-Zug+QiDoJOrZ5t4lssLdxGhVrurbmBWopoEl+M6BdEfwnCJZtKxi1KgxUyJq13dy" crossorigin="anonymous">
	<link rel="stylesheet" href="{{ URL::asset('css/medium.css') }}">
	<script defer src="https://use.fontawesome.com/releases/v5.0.2/js/all.js"></script>

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

</div>

<!-- JavaScripts -->
<script src="{{ URL::asset('js/main.js') }}"></script>
