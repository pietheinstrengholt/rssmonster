//source: http://www.inserthtml.com/2013/01/scroll-pagination/

//function to remove all spaces and non alphanumeric characters
function onlyalphanumeric(input) {
  var nospaces = input.replace(/\s+/g, '');
  var onlyalpha = nospaces.replace(/\W/g, '');
  return onlyalpha;
}

//pool for mark as read
var poolid = new Array();

//function to mark items as read
function FnReadPool(input) {
   if (jQuery.inArray(input, poolid) == -1) {

     setTimeout(function() {
     	console.log("viewport:" + input);
     }, 600);

     $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "item-as-read",
                "value": input
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {

		//capture feed and status, filter out non alphanumeric and white spaces
		var feed = onlyalphanumeric(data[0]['feed']);
		var category = onlyalphanumeric(data[0]['category']);

		//only in case when status is unread
	        if (data[0]['status'] == "unread") {

			//decrease uread count
			var unreadcount = $('div.nav-main div#unread.menu-heading-status span.count').text();
	        	var unreadcountnew = unreadcount -1;
			$('div.nav-main div#unread.menu-heading-status span.count').text(unreadcountnew);

			//increase read count
	        	var readcount = $('div.nav-main div#read.menu-heading-status span.count').text();
			var readcountnew = parseFloat(readcount)+1;
		        $('div.nav-main div#read.menu-heading-status span.count').text(readcountnew);

			//decrease count for main menu items
			var readcountmain = $('div.feedbar').find('#' + category).find('span.count.unread').text();
			var readcountmainnew = readcountmain -1;
			$('div.feedbar').find('#' + category).find('span.count.unread').text(readcountmainnew);

			//decrease count for sub menu items
			var readcountsub = $('div.feedbar').find('#' + feed).find('span.count-sub').text();
			var readcountsubnew = readcountsub -1;
			$('div.feedbar').find('#' + feed).find('span.count-sub').text(readcountsubnew);

			//decrease count for last 24 hours
			if (data[0]['publish_date'] == "last-24-hours") {
	                        var tfcount = $('div.nav-main div#last-24-hours.menu-heading-status span.count').text();
        	                var tfcountnew = tfcount -1;
                	        $('div.nav-main div#last-24-hours.menu-heading-status span.count').text(tfcountnew);
			}

			//decrease count for last 24 hours and last hour
                        if (data[0]['publish_date'] == "last-hour") {
                                var lastcount = $('div.nav-main div#last-hour.menu-heading-status span.count').text();
                                var lastcountnew = lastcount -1;
                                $('div.nav-main div#last-hour.menu-heading-status span.count').text(lastcountnew);

                                var tfcount = $('div.nav-main div#last-24-hours.menu-heading-status span.count').text();
                                var tfcountnew = tfcount -1;
                                $('div.nav-main div#last-24-hours.menu-heading-status span.count').text(tfcountnew);
                        }

		}

	    },
            failure: function (errMsg) {}
     });

     //push the id from the article to the pool, so it will never be marked as read twice
     poolid.push(input);
   }
}

//function for detailed scrolling and gathering data
(function ($) {

    $.fn.scrollPagination = function (options) {

	//default settings
        var settings = {
            nop: 1, // The number of posts per scroll to be loaded
            offset: 0, // Initial offset, begins at 0 in this case
            error: 'No More Posts!', // When the user reaches the end this is the message that is
            delay: 100, // When you scroll down the posts will load after a delayed amount of time.
            scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
            category: '',
            feed: '',
	    status: '',
	    sort: '',
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
	    $this.append('<div class="content"></div><div class="info-bar" id="info-bar"><div style="width: 50%;"></div></div>');

	    $.ajax({
               type: "POST",
               url: "json.php",
               data: JSON.stringify({
                   "jsonrpc": "2.0",
                   "request": "get-article-list",
		   "status": $settings.status,
                   "sort": $settings.sort,
                   "feed": $settings.feed,
                   "category": $settings.category
               }),
               contentType: "application/json; charset=utf-8",
               dataType: "json",
               async: false,
               success: function (json) {
                   result = json;
               },
               failure: function (errMsg) {}
            });

            function getData(input) {

                // Post data to detailed-view.php
                $.post('detailed-view.php', {
		    sort: $settings.sort,
		    articlelist: input,
                }, function (data) {

                    // Change loading bar content (it may have been altered)
                    $this.find('.info-bar').html($initmessage);

                    // If there is no data returned, there are no more posts to be shown. Show message
                    if (data == "") {
                        $this.find('.info-bar').html($settings.error);
                    } else {

                        // If data is returned, append the data to the content div
                        $this.find('.content').append(data);

			//add waypoint function to h3 header, look at FnReadPool
			$('div#block h3').waypoint(function() {
			  var id = $(this).attr('id');
			  FnReadPool(id);
			}, { offset: 10, triggerOnce: true });

                        // Offset increases
                        offset = offset + $settings.nop;

                        // No longer busy!	
                        busy = false;
                    }

                });

            }


	    // On fist load
	    if( result[0] === undefined ) {
		console.log("No posts found on first load");
                $this.find('.info-bar').html('No posts available, all marked as read');
	    } else {
		console.log("get data on load: " + result[0].join(","));
            	getData(result[0].join(",")); // Run function initially
	    }

            // If scrolling is enabled
            if ($settings.scroll == true) {
                // .. and the user is scrolling

                //using on and off to avoid loading multiple instances
                $(window).on('scroll', function () {

                    // Check the user is at the bottom of the element
                    var scrollheight = $(window).scrollTop() + $(window).height();

                    if (scrollheight > $this.height() && !busy) {

                        console.log('maximum scrollheight reached, reloading getData');

                        // Now we are working, so busy is true
                        busy = true;

                        // Tell the user we're loading posts
                        $this.find('.info-bar').html('Loading Posts');

                        // Run the function to fetch the data inside a delay
                        // This is useful if you have content in a footer you
                        // want the user to see.
                        setTimeout(function () {

			    //mark remaining items as read
			    if( result[offset] === undefined ) { 
				console.log("pool with id's is empty, mark last items in batch as read: " + result[offset-1].join(","));

				for (var i = 0; i < result[offset-1].length; i++) {
				  //console.log(result[offset-1][i]);
				  FnReadPool(result[offset-1][i]);
				}


				//todo: use FnReadPool for every item in comma seperated list
			        //$.ajax({
			        //    type: "POST",
			        //    url: "json.php",
			        //    data: JSON.stringify({
			        //        "jsonrpc": "2.0",
			        //        "update": "item-as-read",
			        //        "value": result[offset-1].join(",")
			        //    }),
			        //    contentType: "application/json; charset=utf-8",
			        //    dataType: "json",
			        //    success: function (data) {},
			        //    failure: function (errMsg) {}
				//});

				$this.find('.info-bar').html('No more posts available');

			    } else {
			    	console.log("get data for batch:" + offset + " items: " + result[offset].join(","));
                            	getData(result[offset].join(","));
			    }

                        }, $settings.delay);
                    }
                });

            }

            // When a few items are loaded scrolling is not possible. Mark as read then by clicking on the info-bar
            $this.find('.info-bar').click(function () {
	       if (busy == false) {
                   busy = true;
		   console.log("only a few items loaded - mark as read: " + result[0].join(","));

		   //mark items as read
                   for (var i = 0; i < result[0].length; i++) {
                       FnReadPool(result[0][i]);
                   }


                   //todo: use FnReadPool for every item in comma seperated list
                   //$.ajax({
                   //    type: "POST",
                   //    url: "json.php",
                   //    data: JSON.stringify({
                   //        "jsonrpc": "2.0",
                   //        "update": "item-as-read",
                   //        "value": result[0].join(",")
                   //    }),
                   //    contentType: "application/json; charset=utf-8",
                   //    dataType: "json",
                   //    success: function (data) {},
                   //    failure: function (errMsg) {}
                   //});

		   $this.find('.info-bar').html('Marked all items as read');

                   //getData();
               }
	    
            });

        });
    }

})(jQuery);
