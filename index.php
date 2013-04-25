<?php

include 'config.php';
include 'functions.php';

?>

<!doctype html>
<html>
  <head>
   <?php include 'header.php'; ?>
  </head>

  <body>

      <top-nav>
          <?php include 'top-nav.php'; ?>
      </top-nav>

      <div id="nav-bar-shadow"></div>

      <div class="wrapper">

        <feedbar>
          <?php include 'feedbar.php'; ?>
        </feedbar>

        <section>
          <div id="content"></div>
        </section>

     </div>
  </body>

</html>
