//TODO: read window.location.hash and if set reload section with post parameters
$(document).ready(function () {

    //dropdown toggle
    $('.dropdown-toggle').dropdown();

    //remove scrollbar
    $('feedbar').css({
        'overflow-y': 'hidden'
    });

    function loadview(view, type, value) {

	//debug
        console.log(view + " type: " + type);
        console.log(view + " value: " + value);

	//set location path
	window.location.hash = '#' + type + '=' + value;

        //set cookie view to view parameter
	$.cookie('view', view, { expires: 14 });
	var viewtype = $.cookie('view');

        if (view == 'list') {
           loadlistview(type, value);
        } else if (view == 'detailed') {
           loaddetailedview(type, value);
        } else {
           loaddetailedview(type, value);
	}


    }

    //loadlistview function
    function loadlistview(type, value) {

	$(window).off("scroll");
	$('section').load('list-view.php?' + type + '=' + value);
    }

    //loaddetailedview function to load items when scrolling. Remember to use: $(window).off("scroll");
    function loaddetailedview(type, value) {

	//set category, feed and status variables
	if (type == 'category') { var category = value; }
        if (type == 'feed') { var feed = value; }
        if (type == 'status') { var status = value; }

	//remove content and offload scroll
        $('section').empty();
        $('section #content').remove();
        $('section').append('<div id="content"></div>');
        $(window).off("scroll");

	//use small amount of timeout
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

    //on a first load get hashtag value from url
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
        console.log("windows location hash is not set, retrieve unread items");
        hashtype = "status";
	hashvalue = "unread";
    }

    //get viewtype from cookie
    var viewtype = $.cookie('view');

    //load content
    loadview(viewtype, hashtype, hashvalue);

    //Functionality from menu when Articles section is clicked
    jQuery("div.menu-heading-status").click(function () {

	//remove and add clicked status to class
	$('div.nav-main').find('.status-clicked').removeClass("status-clicked");
	$(this).addClass("status-clicked");

	//load content
        var viewtype = $.cookie('view');
        var status = $(this).find("div.title").text();
        var encoded_status = encodeURIComponent(status);
	loadview(viewtype, 'status', encoded_status);

    });

    //Category function on feedbar: Drop down menu sub-menu items when a category is clicked
    //hide sub menu by default
    jQuery("div.menu-sub").hide();
    jQuery("div.menu-heading").click(function () {

	//avoid scrollbar
        $('feedbar').css({
            'overflow-y': 'hidden'
        });

	//remove any active clicked classes from status overview
	$('div.nav-main').find('.status-clicked').removeClass("status-clicked");

	//open submenu
        jQuery(this).next("div.menu-sub").slideToggle(200);

	//change styling and arrow
        if ($(this).hasClass("clicked")) {
            $(this).removeClass("clicked");
            $(this).css("background-color", "");
            $(this).css("color", "");
	    $(this).find('div.pointer-category i').attr('class', 'icon-chevron-right');
        } else {
            $(this).addClass("clicked");
            $(this).css("background-color", "#0088cc");
            $(this).css("color", "#ffffff");
	    $(this).find('div.pointer-category i').attr('class', 'icon-chevron-down');
        }

	//load content
        var viewtype = $.cookie('view');
        var category = $(this).find("div.title").text();
        var encoded_category = encodeURIComponent(category);
        loadview(viewtype, 'category', encoded_category);

    });

    //Functionality when sub menu item from categories is clicked
    jQuery("div.menu-sub-item").click(function () {

        //remove any active clicked classes from status overview
        $('div.nav-main').find('.status-clicked').removeClass("status-clicked");

        //only one menu-sub-item can be active
        $("div.feedbar").find("div.menu-sub-item").css('background-color', '');
        $(this).css("background-color", "#dceaf4");

	//load content
        var viewtype = $.cookie('view');
        var feed = $(this).find("span.title").text();
        var encoded_feed = encodeURIComponent(feed);
	loadview(viewtype, 'feed', encoded_feed);

    });

    //List view button from topnav menu
    jQuery("a#list-view").click(function () {
        console.log("switched to list view");
        loadview('list', hashtype, hashvalue);
    });

    //Detailed view button from topnav menu
    jQuery("a#detailed-view").click(function () {
        console.log("switched to detailed view");
        loadview('detailed', hashtype, hashvalue);
    });

    //Load opml import screen in section
    jQuery("a#import-opml").click(function () {
	$(window).off("scroll");
        $('section').load('opml.php');
    });

    //Load opml import screen in section
    jQuery("a.update").click(function () {
	//show progress bar while loading
	console.log("update.php called");
	$(window).off("scroll");
	$('section').empty();
        $('section').load('update.php');
	//$('section').append('<div class="progress progress-striped active"><div class="bar" style="width: 40%;"></div></div>');
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
