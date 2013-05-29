<?php

include 'config.php';
include 'functions.php';

?>

<div class="navbar navbar-fixed-top navbar-inverse">
  <div class="navbar-inner">

    <?php echo "<a class=\"brand\" href=\"$url/index.php\">Home</a>"; ?>

    <ul class="nav">
      <li><a id="import-opml" href="#">Import OPML</a></li>
    </ul>

    <ul class="nav">
      <li class="dropdown">
         <a id="drop1" href="#" role="button" class="dropdown-toggle" data-toggle="dropdown">Views<b class="caret"></b></a>
         <ul class="dropdown-menu" role="menu" aria-labelledby="drop1">
            <li class="detailed-view" role="presentation"><a id="detailed-view" role="menuitem" tabindex="-1" href="#">Detailed view</a></li>
            <li class="list-view" role="presentation"><a id="list-view" role="menuitem" tabindex="-1" href="#">List view</a></li>
         </ul>
      </li>
    </ul>

    <form class="navbar-form pull-left" method="post" action="addfeedhandler.php">
      <input type="text" value="Add feed or url" name="feedname" class="span2">
      <button type="submit" class="btn">Submit</button>
    </form>

    <ul class="nav">
      <?php echo "<li><a class=\"update\" href=\"$url/update.php\">Update feeds</a></li>"; ?>
    </ul>

  </div>
</div>
