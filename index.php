<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>phppaper by Piethein Strengholt</title>
    <script src="javascripts/jquery-1.9.1.min.js"></script>
    <script src="javascripts/jquery.color.js"></script>
    <script src="javascripts/jquery.mCustomScrollbar.concat.min.js"></script>
    <script src="javascripts/jquery.cookie.js"></script>
    <script src="javascripts/jquery.bullseye-1.0-min.js"></script>
    <script src="javascripts/infinite.js"></script>
    <script src="javascripts/phppaper.js"></script>
    <script src="javascripts/bootstrap.min.js"></script>
    <link rel="stylesheet" href="stylesheets/styles.css">
    <link rel="stylesheet" href="stylesheets/bootstrap.css">
    <script type="text/javascript"> if (!window.console) console = {log: function() {}}; </script>

    <style type="text/css">
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

   <link rel="stylesheet" href="stylesheets/bootstrap-responsive.css">

  </head>

  <body>

      <?php include 'top-nav.php'; ?>

<div class="container-fluid">
  <div class="row-fluid">
    <div class="span3 hidden-tablet hidden-phone">
      <feedbar>
        <?php include 'feedbar.php'; ?>
      </feedbar>
    </div>
    <div class="span9">
      <section></section>
    </div>
  </div>
</div>

  </body>

</html>
