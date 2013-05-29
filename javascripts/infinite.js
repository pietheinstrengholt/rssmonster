//source: http://www.inserthtml.com/2013/01/scroll-pagination/
//function to parse input arguments from url

(function ($) {

    $.fn.scrollPagination = function (options) {

        console.log("fn.scrollPagination initialized");

        var settings = {
            nop: 10, // The number of posts per scroll to be loaded
            offset: 0, // Initial offset, begins at 0 in this case
            error: 'No More Posts!', // When the user reaches the end this is the message that is
            delay: 500, // When you scroll down the posts will load after a delayed amount of time.
            scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
            category: '',
            feed: ''
        }

        // Extend the options so they work with the plugin
        if (options) {
            $.extend(settings, options);
        }

        // For each so that we keep chainability.
        return this.each(function () {

            // Some variables 
            $this = $(this);
            $settings = settings;
            var offset = $settings.offset;
            var busy = false; // Checks if the scroll action is happening so we don't run it multiple times

            // Custom messages based on settings
            if ($settings.scroll == true) $initmessage = 'Scroll for more or click here';
            else $initmessage = 'Click for more';

            // Append custom messages and extra UI
            //$this.append('<div class="content"></div><div class="loading-bar" id="loading-bar">' + $initmessage + '</div>');
	    $this.append('<div class="content"></div><div class="loading-bar progress progress-striped active" id="loading-bar"><div class="bar" style="width: 50%;"></div></div>');

            function getData() {

                // Post data to detailed-view.php
                $.post('detailed-view.php', {

                    action: 'scrollpagination',
                    number: $settings.nop,
                    offset: offset,
                    feed_name: $settings.feed,
                    category_name: $settings.category,
		    status: $settings.status,

                }, function (data) {

                    //log message
                    console.log('fetching data for offset:' + offset);

                    // Change loading bar content (it may have been altered)
                    $this.find('.loading-bar').html($initmessage);

                    // If there is no data returned, there are no more posts to be shown. Show error
                    if (data == "") {
			$this.find('.loading-bar').removeClass('progress progress-striped active')
                        $this.find('.loading-bar').html($settings.error);
                    } else {

                        // Append the data to the content div
                        $this.find('.content').append(data);

                        // Add bullseye function to article headers
                        // TODO: do not target previous added article headers
                        $('div#block h3').on('leaveviewport', myHandler).bullseye();

                        // Offset increases
                        offset = offset + $settings.nop;

                        // No longer busy!	
                        busy = false;
                    }

                });

            }

            getData(); // Run function initially

            // If scrolling is enabled
            if ($settings.scroll == true) {
                // .. and the user is scrolling

                //using on and off to avoid loading multiple instances
                $(window).on('scroll', function () {

                    // Check the user is at the bottom of the element
                    var scrollheight = $(window).scrollTop() + $(window).height();

                    if (scrollheight > $this.height() && !busy) {

                        console.log('maximum scrollheight reached, reloading ajax.php');

                        // Now we are working, so busy is true
                        busy = true;

                        // Tell the user we're loading posts
                        $this.find('.loading-bar').html('Loading Posts');

                        // Run the function to fetch the data inside a delay
                        // This is useful if you have content in a footer you
                        // want the user to see.
                        setTimeout(function () {

                            getData();

                        }, $settings.delay);
                    }
                });

            }

            // Also content can be loaded by clicking the loading bar/
            $this.find('.loading-bar').click(function () {

                if (busy == false) {
                    busy = true;
                    getData();
                }

            });

        });
    }

})(jQuery);
