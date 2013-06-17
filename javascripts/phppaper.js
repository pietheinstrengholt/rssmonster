//TODO: read window.location.hash and if set reload section with post parameters
$(document).ready(function () {

    //dropdown toggle
    $('.dropdown-toggle').dropdown();

    //remove scrollbar
    $('feedbar').css({
        'overflow-y': 'hidden'
    });

    //loadscrollPagination function to load items when scrolling. Remember to use: $(window).off("scroll");

    function loadscrollPagination(category, feed, status) {
        setTimeout(function () {

            $('#content').scrollPagination({
                nop: 10, // The number of posts per scroll to be loaded
                offset: 0, // Initial offset, begins at 0 in this case
                error: 'No More Posts - All items marked as read!', // When the user reaches the end this is the message that is
                delay: 500, // When you scroll down the posts will load after a delayed amount of time.
                scroll: true, // The main bit, if set to false posts will not load as the user scrolls.
                category: category, // Catch category from menu
                feed: feed, // Catch feedname from menu
                status: status // Catch status from menu
            });
        }, 100);
    }

    //get hashtag value from url
    var request = window.location.hash;
    request = request.slice(1);
    console.log("hashtag value from url:" + request);

    function getFirstPart(str) {
        return str.split('=')[0];
    }

    function getSecondPart(str) {
        return str.split('=')[1];
    }

    hashtype = getFirstPart(request);
    hashvalue = getSecondPart(request);

    if (typeof hashvalue === "undefined") {
        console.log("hashvalue is undefined");
        //hashvalue = "";
    }

    console.log(hashtype);
    console.log(hashvalue);

    //set cookie for view, if not set
    if ($.cookie('view') == 'undefined') {
        console.log("cookie undefined, set cookie");
        $.cookie('view', 'detailed', {
            expires: 14
        });
    } else {
        console.log("cookie found with current view type: " + $.cookie('view'));
    }

    //get viewtype from cookie
    var viewtype = $.cookie('view');
    console.log("current view type = " + viewtype);

    //load list view is cookie is set to list view
    if (viewtype == 'list') {

        //TODO: scrollpagination is still active when switching to list view
        console.log("first load, load view list items for: " + request);
        $('section').load(viewtype + '-view.php?' + request);
    } else {
        console.log("first load, load detailed list items for: " + request);
        var encoded = encodeURIComponent(request);
        viewtype = "detailed";
        $('section #content').remove();
        $('section').append('<div id="content"></div>');
        $(window).off("scroll");
        loadscrollPagination('', '');
    }

    //remember windows location hash (obsolete)
    $('div.main a').each(function () {
        this.href = this.href + window.location.hash;
    });

    //Status function on feed
    jQuery("div.menu-heading-status").click(function () {
        var status = $(this).find("div.title").text();
        console.log("Clicked on status: " + status);
        var encoded_status = encodeURIComponent(status);
        window.location.hash = '#status=' + encoded_status;

        hashtype = "status";
        hashvalue = encoded_status;

	$('div.nav-main').find('.status-clicked').removeClass("status-clicked");
	$(this).addClass("status-clicked");

	if (viewtype == 'detailed') {

            $('section #content').remove();
            $('section').append('<div id="content"></div>');
            $(window).off("scroll");
            loadscrollPagination('', '', encoded_status);

        } else {
            $(window).off("scroll");
            $('section').load('list-view.php?status=' + encoded_status);
        }

    });

    //Categorie function on feedbar: Drop down menu sub-menu items when categorie is clicked
    jQuery("div.menu-sub").hide();
    jQuery("div.menu-heading").click(function () {

	//avoid scrollbar
        $('feedbar').css({
            'overflow-y': 'hidden'
        });

	//remove any active clicked classes from status overview
	$('div.nav-main').find('.status-clicked').removeClass("status-clicked");

        var category = $(this).find("div.title").text();
        console.log("Clicked on category: " + category);
        console.log("viewtype = " + viewtype);
        var encoded_category = encodeURIComponent(category);

        if (viewtype == 'detailed') {

            $('section #content').remove();
            $('section').append('<div id="content"></div>');
            $(window).off("scroll");
            loadscrollPagination(encoded_category, '');

        } else {
            $(window).off("scroll");
            $('section').load('list-view.php?category=' + encoded_category);
        }

        window.location.hash = '#category=' + encoded_category;

        hashtype = "category";
        hashvalue = encoded_category;

        jQuery(this).next("div.menu-sub").slideToggle(200);

        if ($(this).hasClass("clicked")) {
            $(this).removeClass("clicked");
            $(this).css("background-color", "");
            $(this).css("color", "");
	    $(this).find('div.pointer-category i').attr('class', 'icon-chevron-right');
        } else {
            $(this).addClass("clicked");
            //$(this).css( "background-color", "rgba( 0,0,0,0.04 )" );
            $(this).css("background-color", "#0088cc");
            $(this).css("color", "#ffffff");
	    $(this).find('div.pointer-category i').attr('class', 'icon-chevron-down');
        }
    });


    //Functionality when sub menu item from categories is clicked
    jQuery("div.menu-sub-item").click(function () {

        //remove any active clicked classes from status overview
        $('div.nav-main').find('.status-clicked').removeClass("status-clicked");

        var feed = $(this).find("span.title").text();
        console.log("Clicked on feed: " + feed);
        var encoded_feed = encodeURIComponent(feed);
        window.location.hash = '#feed=' + encoded_feed;

        hashtype = "feed";
        hashvalue = encoded_feed;

        //only one menu-sub-item can be active
        $("div.feedbar").find("div.menu-sub-item").css('background-color', '');
        $(this).css("background-color", "#dceaf4");

        if (viewtype == 'detailed') {

            $('section #content').remove();
            $('section').append('<div id="content"></div>');
            $(window).off("scroll");
            loadscrollPagination('', encoded_feed);

        } else {
            $(window).off("scroll");
            $('section').load('list-view.php?feed=' + encoded_feed);
        }

    });

    //Load opml import screen in section
    jQuery("a#import-opml").click(function () {
        $('section').load('opml.php');
    });

    //Load opml import screen in section
    jQuery("a.update").click(function () {
	//show progress bar while loading
	console.log("update.php called");
	$(window).off("scroll");
	$('section').empty();
	$('section').append('<div class="update-content"></div><div class="loading-bar progress progress-striped active" id="loading-bar"><div class="bar" style="width: 50%;"></div></div>');
        $('section').load('update.php');
    });

    //Load organize feeds section
    jQuery("div.organize button.btn.btn-small.btn-primary").click(function () {
	$(window).off("scroll");
        $('section').load('manage-feeds.php');
    });

    //Load organize feeds section
    jQuery("div.organize button.btn.btn-small.btn-warning").click(function () {
	console.log("mark-as-read button clicked");
        $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "mark-as-read"
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            async: false,
            success: function (json) {
                result = json;
                //scroll to top before refresh
                document.body.scrollTop = document.documentElement.scrollTop = 0;
                //refresh page to load new articles
                location.reload();
            },
            failure: function (errMsg) {}
        });
    });

    //List view button
    jQuery("a#list-view").click(function () {
        console.log("switched to list view");
        $.cookie('view', 'list', { expires: 14 });
        viewtype = "list";

        $(window).off("scroll");
        $('section').load('list-view.php?' + hashtype + "=" + hashvalue);

    });

    //Detailed view button
    jQuery("a#detailed-view").click(function () {

        //set cookie and variable to detailed view
        console.log("switched to detailed view");
        $.cookie('view', 'detailed', { expires: 14 });
        viewtype = "detailed";

        //remove existing content and add empty again
        $('section').empty();
        $('section #content').remove();
        $('section').append('<div id="content"></div>');

        //disable existing scroll and load loadscrollPagination
        $(window).off("scroll");

        console.log("switched to detailed view with hashtype: " + hashtype + " and hashvalue: " + hashvalue);

        if (hashtype == 'category') {
            loadscrollPagination(hashvalue, '');
        } else if (hashtype == 'feed') {
            loadscrollPagination('', hashvalue);
        } else if (hashtype == 'status') {
            loadscrollPagination('', '', hashvalue);
        } else if (typeof hashvalue === "undefined") {
            loadscrollPagination('', '');
        }
    });

    //event when marking item as starred
    $("body").on("click", "img.item-star.unstar", function (event) {
        var id = $(this).attr('id');
        console.log('starred item: ' + $(this).attr('id'));
        $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "star-mark",
                "value": id
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            async: false,
            success: function (json) {
                result = json;
            },
            failure: function (errMsg) {}
        });

        $(this).attr('src', 'images/star_selected.png');
        $(this).removeClass("unstar");
        $(this).addClass("star");

	//increase count in menu
        var starredcount = $('div.nav-main div#starred.menu-heading-status span.count').text();
        var starredcountnew = parseFloat(starredcount)+1;
        $('div.nav-main div#starred.menu-heading-status span.count').text(starredcountnew);


    });

    //event when unstaring item
    $("body").on("click", "img.item-star.star", function (event) {
        var id = $(this).attr('id');
        console.log('unstarred item: ' + $(this).attr('id'));
        $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "star-unmark",
                "value": id
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            async: false,
            success: function (json) {
                result = json;
            },
            failure: function (errMsg) {}
        });

        $(this).attr('src', 'images/star_unselected.png');
        $(this).removeClass("star");
        $(this).addClass("unstar");

	//decrease star count in menu
        var starredcount = $('div.nav-main div#starred.menu-heading-status span.count').text();
        var starredcountnew = parseFloat(starredcount)-1;
        $('div.nav-main div#starred.menu-heading-status span.count').text(starredcountnew);

    });


});


//infinite.js script is used to call the myHandler function

//create pool for article id's, this to avoid that an article is marked as read twice or more
var pool = new Array();

//create event handler

function myHandler(e) {
    var id = $(this).attr('id');

    //the article id is not in the array
    if (jQuery.inArray(id, pool) == -1) {

        //debug message to console
        console.log($(this).attr('id') + ': ' + e.type);

        //push article id to array
        pool.push(id);

        //mark item as read with json call
	//TODO: Return after marking as read the menu and sub-menu, last hours indicators for updating menu
	//TODO: This requires more advanced scripting. Return array with counts marked as read per category and feed
        $.ajax({
            type: "POST",
            url: "json.php",
            data: JSON.stringify({
                "jsonrpc": "2.0",
                "update": "read-status",
                "value": id
            }),
            contentType: "application/json; charset=utf-8",
            dataType: "json",
            success: function (data) {},
            failure: function (errMsg) {}
        });

	//decrease and increase unread and read amount in menu
	var unreadcount = $('div.nav-main div#unread.menu-heading-status span.count').text();
        var unreadcountnew = unreadcount -1;
	$('div.nav-main div#unread.menu-heading-status span.count').text(unreadcountnew);

        var readcount = $('div.nav-main div#read.menu-heading-status span.count').text();
	var readcountnew = parseFloat(readcount)+1;
        $('div.nav-main div#read.menu-heading-status span.count').text(readcountnew);

    };
}
