<?php

include 'config.php';
include 'functions.php';

if(strstr($_SERVER['HTTP_USER_AGENT'],'iPhone') || strstr($_SERVER['HTTP_USER_AGENT'],'iPod') || strstr($_SERVER['HTTP_USER_AGENT'],'iPad'))
{
 header("Location: $mobile");
}

?>

<html>
 <head>
   <?php include 'header.php'; ?>
 </head>
 <body>
  <top-nav>
   <?php include 'top-nav.php'; ?>
  </top-nav>

  <div class="wrapper">
   <feedbar>
    <?php include 'feedbar.php'; ?>
   </feedbar>

   <short>
    <?php include 'short.php'; ?>
   </short>

   <section>
    <br><div id="content"></div>
   </section>

   <footer>
    <!-- <p><small>by Piethein Strengholt</small></p> -->
   </footer>
  </div>
 </body>
</html>
