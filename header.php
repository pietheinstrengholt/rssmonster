    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="chrome=1">
    <title>phppaper by Piethein Strengholt</title>
    <script src="javascripts/jquery.min.js"></script>
    <script src="javascripts/jquery.color.js"></script>
    <script src="javascripts/jquery.bullseye-1.0-min.js"></script>
    <script src="javascripts/jquery.mCustomScrollbar.concat.min.js"></script>
    <!-- <script src="javascripts/scale.fix.js"></script> -->
    <!-- <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no"> -->
    <script src="javascripts/infinite.js"></script>
    <link rel="stylesheet" href="stylesheets/styles.css">
    <link rel="stylesheet" href="stylesheets/jquery.mCustomScrollbar.css">
    <!--[if lt IE 9]>
    <script src="//html5shiv.googlecode.com/svn/trunk/html5.js"></script>
    <![endif]-->

    <script>

    $(document).ready(function() {

        //$('#content').height($(document).height())

        $('#content').scrollPagination({

                nop     : 10, // The number of posts per scroll to be loaded
                offset  : 0, // Initial offset, begins at 0 in this case
                error   : 'No More Posts!', // When the user reaches the end this is the message that is
                                            // displayed. You can change this if you want.
                delay   : 500, // When you scroll down the posts will load after a delayed amount of time.
                               // This is mainly for usability concerns. You can alter this as you see fit
                scroll  : true // The main bit, if set to false posts will not load as the user scrolls.
                               // but will still load if the user clicks.

        });
    });

    </script>

<script>
    (function($){
        $(window).load(function(){
           $("feedbar").mCustomScrollbar();
           // $("short").mCustomScrollbar();
        });
    })(jQuery);

</script>
