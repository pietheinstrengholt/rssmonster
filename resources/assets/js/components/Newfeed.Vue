<template>
    <div class="subscribe-toolbar">
        <div id="newfeed">
            <div id="show-modal" @click="$store.modal=true">
                <i @click="$store.modal=true" class="fas fa-plus" data-fa-transform="down-12"></i>
            </div>
        </div>
        <form class="new-form-wrap" data-behavior="search_form" accept-charset="UTF-8" data-remote="true" method="post" role="url"><input name="utf8" type="hidden" value="✓">
            <input type="text" name="url" class="query" placeholder="Search" autocomplete="off">
        </form>
    </div>
</template>

<style>
div.subscribe-toolbar {
	height: 40px;
	border-bottom: 1px solid transparent;
	border-color: #dcdee0;
	position: absolute;
	width: 100%;
	overflow: hidden;
    background-color: #eff1f3;
}

div#newfeed {
    height: 100%;
    width: 20%;
    float: left;
    text-align: center;
    border-right: 1px solid black;
    border-color: #dcdee0;
}

form.new-form-wrap {
    width: 80%;
    float: left;
}

.query {
    width: 100%;
    color: #3399FF;
    height: 39px;
    margin: 0;
    padding: 4px 0px 3px 28px;
    font-size: 14px;
    background-color: #eff1f3;
    border: none;
    line-height: 1;
    color: #212325;
    background: url(http://localhost/rssmonster/public/img/search.svg) 8px 13px no-repeat;
}

div#show-modal {
    height: 100%;
}
</style>

<script>
    export default {
        store: {
            modal: 'modal'
        }
    }
</script>