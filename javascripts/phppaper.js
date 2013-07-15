//TODO: read window.location.hash and if set reload section with post parameters
$(document).ready(function () {

    //dropdown toggle
    $('.dropdown-toggle').dropdown();

    //remove scrollbar
    $('feedbar').css({
        'overflow-y': 'hidden'
    });

    //sort stored in cookie
    if (($.cookie('sort') == undefined)) {
	$.cookie('sort', 'desc', { expires: 14 });
    }

    //sort stored in cookie
    if (($.cookie('view') == undefined)) {
        $.cookie('view', 'detailed', { expires: 14 });
    }

    //on a first load get hashtag value from url
    var request = window.location.hash;
    request = request.slice(1);
    function getFirstPart(str) { return str.split('=')[0]; }
    function getSecondPart(str) { return str.split('=')[1]; }

    if (request.length == 0) {
	if (($.cookie('type') == undefined) && ($.cookie('value') == undefined)) {
	   $.cookie('type', 'status', { expires: 14 });
           $.cookie('value', 'unread', { expires: 14 });
	}
    } else {
    	$.cookie('type', getFirstPart(request));
    	$.cookie('value', getSecondPart(request));
    }

    //TODO: change feedbar and submenu bar is type and value are set

    var sort = $.cookie('sort');
    var view = $.cookie('view');
    var type = $.cookie('type');
    var value = $.cookie('value');

    //load content
    loadview($.cookie('view'), $.cookie('type'), $.cookie('value'), $.cookie('sort'));

    function loadview(view, type, value, sort) {

	var sort = $.cookie('sort');
    	var view = $.cookie('view');
	var type = $.cookie('type');
	var value = $.cookie('value');

	console.log(type + "=" + value + "(" + sort + " & " + view + ")");

	//set location path
	//TODO: fix when switching to detailed or sort, remains empty now
	window.location.hash = "#" + type + "=" + value;

        //set cookie view to view parameter
	$.cookie('view', view, { expires: 14 });
	var view = $.cookie('view');

        if (view == 'list') {
           loadlistview(type, value, sort);
        } else if (view == 'detailed') {
           loaddetailedview(type, value, sort);
        } else {
           loaddetailedview(type, value, sort);
	}
    }

    //loadlistview function
    function loadlistview(type, value, sort) {
	$(window).off("scroll");
        $('section').empty();
	$('section').load('list-view.php?' + type + '=' + value + '&sort=' + sort);
    }

    //loaddetailedview function to load items when scrolling. Remember to use: $(window).off("scroll");
    function loaddetailedview(type, value, sort) {

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
                status: status, // Catch status from menu
		sort: sort // Catch sort
            });
        }, 100);
    }

    //Functionality from menu when Articles section is clicked
    jQuery("div.menu-heading-status").click(function () {

	//remove and add clicked status to class
	$('div.nav-main').find('.status-clicked').removeClass("status-clicked");
	$(this).addClass("status-clicked");

	//load content
        var view = $.cookie('view');
        var status = $(this).find("div.title").text();
        var encoded_status = encodeURIComponent(status);
	$.cookie('type', 'status');
	$.cookie('value', encoded_status);
	loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));

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
        $(this).next("div.menu-sub").slideToggle(200);

	//remove and add active classes, needed for decreasing dynamic count
	$('div.feedbar').find('.active-main').removeClass("active-main");
	$('div.feedbar').find('.active-sub').removeClass("active-sub");
	$(this).addClass("active-main");

	//change styling and arrow
        if ($(this).hasClass("category-clicked")) {
            $(this).removeClass("category-clicked");
            $(this).css("background-color", "");
            $(this).css("color", "");
	    $(this).find('div.pointer-category i').attr('class', 'icon-chevron-right');
        } else {
            $(this).addClass("category-clicked");
            $(this).css("background-color", "#0088cc");
            $(this).css("color", "#ffffff");
	    $(this).find('div.pointer-category i').attr('class', 'icon-chevron-down');
        }

	//load content
        var view = $.cookie('view');
        var category = $(this).find("div.title").text();
        var encoded_category = encodeURIComponent(category);
	$.cookie('type', 'category');
        $.cookie('value', encoded_category);
        loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));

    });

    //Functionality when sub menu item from categories is clicked
    jQuery("div.menu-sub-item").click(function () {

        //remove any active clicked classes from status overview
        $('div.nav-main').find('.status-clicked').removeClass("status-clicked");

	//remove and add active classes, needed for decreasing dynamic count
        $('div.feedbar').find('.active-sub').removeClass("active-sub");
        $(this).addClass("active-sub");

        //only one menu-sub-item can be active
        $("div.feedbar").find("div.menu-sub-item").css('background-color', '');
        $(this).css("background-color", "#dceaf4");

	//load content
        var view = $.cookie('view');
        var feed = $(this).find("span.title").text();
        var encoded_feed = encodeURIComponent(feed);
        $.cookie('type', 'feed');
        $.cookie('value', encoded_feed);
        loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));
    });

    //List view button from topnav menu
    jQuery("a#list-view").click(function () {
        $.cookie('view', 'list', { expires: 14 });
	loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));
    });

    //Detailed view button from topnav menu
    jQuery("a#detailed-view").click(function () {
	$.cookie('view', 'detailed', { expires: 14 });
	loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));
    });

    //Sort button from topnav menu
    jQuery("a#sort-asc").click(function () {
	$.cookie('sort', 'asc', { expires: 14 });
	loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));
    });

    //Sort button from topnav menu
    jQuery("a#sort-desc").click(function () {
        $.cookie('sort', 'desc', { expires: 14 });
	loadview($.cookie('view'), $.cookie('type'), $.cookie('value'));
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
    $("section").on("click", "div#block", function (event) {
	$("section").find("div#block.active").removeClass("active");
	$(this).addClass("active");
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

	//decrease and increase unread and read amount in menu, only when read is not active
        if(!$('div#read.menu-heading-status.status-clicked').length > 0) {
		var unreadcount = $('div.nav-main div#unread.menu-heading-status span.count').text();
        	var unreadcountnew = unreadcount -1;
		$('div.nav-main div#unread.menu-heading-status span.count').text(unreadcountnew);

	        var readcount = $('div.nav-main div#read.menu-heading-status span.count').text();
		var readcountnew = parseFloat(readcount)+1;
	        $('div.nav-main div#read.menu-heading-status span.count').text(readcountnew);
	}

	//decrease main and submenu items
	var readcountsub = $('div.feedbar').find('.active-sub span.count-sub').text();
	var readcountsubnew = readcountsub -1;
	$('div.feedbar .active-sub span.count-sub').text(readcountsubnew);

	var readcountmain = $('div.feedbar').find('.active-main span.count.unread').text();
	var readcountmainnew = readcountmain -1;
	$('div.feedbar .active-main span.count.unread').text(readcountmainnew);

	if($('div#last-24-hours.menu-heading-status.status-clicked').length > 0) {
		var readcount24hours = $('div#last-24-hours.menu-heading-status.status-clicked').find('span.count').text();
		var readcount24hoursnew = readcount24hours -1;
		$('div#last-24-hours.menu-heading-status.status-clicked span.count').text(readcount24hoursnew);
	}

        if($('div#last-hour.menu-heading-status.status-clicked').length > 0) {
                var readcountlasthour = $('div#last-hour.menu-heading-status.status-clicked').find('span.count').text();
                var readcountlasthournew = readcountlasthour -1;
                $('div#last-hour.menu-heading-status.status-clicked span.count').text(readcountlasthournew);
        }


    };
}
