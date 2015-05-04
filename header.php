<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
	<title>phppaper by Piethein Strengholt</title>
	<script src="javascripts/jquery-1.11.2.min.js"></script>
	<script src="javascripts/jquery.color.js"></script>
	<script src="javascripts/jquery.mCustomScrollbar.concat.min.js"></script>
	<script src="javascripts/jquery.cookie.js"></script>
	<script src="javascripts/phppaper.js"></script>
	<script src="javascripts/bootstrap.min.js"></script>
	<script src="javascripts/waypoints.js"></script>
	<script src="javascripts/waypoints-infinite.js"></script>
	<link rel="stylesheet" href="stylesheets/styles.css">
	<link rel="stylesheet" href="stylesheets/bootstrap.min.css">
	<link rel="stylesheet" href="stylesheets/bootstrap-theme.min.css">
	<script type="text/javascript"> if (!window.console) console = {log: function() {}}; </script>
	
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
	<link rel="apple-touch-icon" sizes="57x57" href="favicon/apple-icon-57x57.png">
	<link rel="apple-touch-icon" sizes="60x60" href="favicon/apple-icon-60x60.png">
	<link rel="apple-touch-icon" sizes="72x72" href="favicon/apple-icon-72x72.png">
	<link rel="apple-touch-icon" sizes="76x76" href="favicon/apple-icon-76x76.png">
	<link rel="apple-touch-icon" sizes="114x114" href="favicon/apple-icon-114x114.png">
	<link rel="apple-touch-icon" sizes="120x120" href="favicon/apple-icon-120x120.png">
	<link rel="apple-touch-icon" sizes="144x144" href="favicon/apple-icon-144x144.png">
	<link rel="apple-touch-icon" sizes="152x152" href="favicon/apple-icon-152x152.png">
	<link rel="apple-touch-icon" sizes="180x180" href="favicon/apple-icon-180x180.png">
	<link rel="icon" type="image/png" sizes="192x192"  href="favicon/android-icon-192x192.png">
	<link rel="icon" type="image/png" sizes="32x32" href="favicon/favicon-32x32.png">
	<link rel="icon" type="image/png" sizes="96x96" href="favicon/favicon-96x96.png">
	<link rel="icon" type="image/png" sizes="16x16" href="favicon/favicon-16x16.png">
	<link rel="manifest" href="favicon/manifest.json">
	<meta name="msapplication-TileColor" content="#ffffff">
	<meta name="msapplication-TileImage" content="favicon/ms-icon-144x144.png">
	<meta name="theme-color" content="#ffffff">	
</head>
  
<?php

// Get overview of Article status
$status = get_json('{"jsonrpc": "2.0", "overview": "status"}');

?>  

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
    <a class="navbar-brand" id="home" href="<?php echo "$url/index.php"; ?>">Home</a>
    <a class="navbar-brand" id="unread" href="#"><span class="badge pull-right"><?php echo $status[0]['count']; ?></span>Unread</a>
	<a class="navbar-brand" id="starred" href="#"><span style="background-color:#f0ad4e;" class="badge pull-right"><?php echo $status[2]['count']; ?></span>Star</a>
   </div>

   <!-- Collect the nav links, forms, and other content for toggling -->
   <div class="collapse navbar-collapse" id="bs-example-navbar-collapse-1">
    <ul class="nav navbar-nav">
      <li class="dropdown">
         <a id="drop1" href="#" role="button" class="dropdown-toggle" data-toggle="dropdown">Views<b class="caret"></b></a>
         <ul class="dropdown-menu" role="menu" aria-labelledby="drop1">
            <li class="detailed-view" role="presentation"><a id="detailed-view" role="menuitem" tabindex="-1" href="#">Detailed view</a></li>
            <li class="list-view" role="presentation"><a id="list-view" role="menuitem" tabindex="-1" href="#">List view</a></li>
            <li class="minimal-view" role="presentation"><a id="minimal-view" role="menuitem" tabindex="-1" href="#">Minimal view</a></li>
         </ul>
      </li>
    </ul>

    <ul class="nav navbar-nav">
      <li class="dropdown">
         <a id="drop1" href="#" role="button" class="dropdown-toggle" data-toggle="dropdown">Sort<b class="caret"></b></a>
         <ul class="dropdown-menu" role="menu" aria-labelledby="drop1">
            <li class="sort-asc" role="presentation"><a id="sort-asc" role="menuitem" tabindex="-1" href="#">Oldest first</a></li>
            <li class="sort-desc" role="presentation"><a id="sort-desc" role="menuitem" tabindex="-1" href="#">Latest first</a></li>
         </ul>
      </li>
    </ul>

    <ul class="nav navbar-nav">
      <li><a id="import-opml" href="#">Import OPML</a></li>
    </ul>

	<form action="addfeedhandler.php" method="post" class="navbar-form navbar-left" role="feedname">
	  <div class="form-group">
	   <input name="feedname" type="text" placeholder="Add feed or url"  style="width: 120px;" class="form-control">
	  </div>
	  <button id="submit" class="btn btn-default">Submit</button>
	</form>	

    <ul class="nav navbar-nav">
      <li><a class="update" href="#">Update feeds</a></li>
    </ul>

    </div><!-- /.nav-collapse -->

   </div><!-- /.container -->
</div><!-- /.navbar -->
