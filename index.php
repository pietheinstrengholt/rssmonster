<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>phppaper by Piethein Strengholt</title>
    <script src="javascripts/jquery-1.9.1.min.js"></script>
    <script src="javascripts/jquery.color.js"></script>
    <script src="javascripts/jquery.mCustomScrollbar.concat.min.js"></script>
    <script src="javascripts/jquery.cookie.js"></script>
    <script src="javascripts/phppaper.js"></script>
    <script src="javascripts/bootstrap.min.js"></script>
    <script src="javascripts/waypoints.js"></script>
    <script src="javascripts/waypoints-infinite.js"></script>
    <link rel="stylesheet" href="stylesheets/styles.css">
    <link rel="stylesheet" href="stylesheets/bootstrap.css">
	<link rel="stylesheet" href="stylesheets/bootstrap-glyphicons.css">
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
	padding-top: 0px;
        /* Enable use of floated navbar text */
        .navbar-text.pull-right {
          float: none;
          padding-left: 5px;
          padding-right: 5px;
        }
      }
    </style>

  </head>

  <body>
	<?php include 'top-nav.php'; ?>

	<div class="row">
	  <div class="visible-lg col-lg-3">
		  <feedbar>
			<?php include 'feedbar.php'; ?>
		  </feedbar>
	  </div>
	  <div class="col-12 col-sm-12 col-lg-9">
		  <section></section>
	  </div>
	</div>

  </body>

</html>
