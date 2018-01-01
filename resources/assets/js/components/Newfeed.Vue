<template>
    <div class="subscribe-toolbar">
        <form class="new-form-wrap" data-behavior="search_form" accept-charset="UTF-8" data-remote="true" method="post" role="url"><input name="utf8" type="hidden" value="✓">
            <input type="text" name="url" class="query" placeholder="Subscribe" autocomplete="off">
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

.query {
    color: #3399FF;
    height: 39px;
    margin: 0;
    padding: 4px 36px 3px 36px;
    font-size: 14px;
    background-color: #eff1f3;
    border: none;
    line-height: 1;
    color: #212325;
    background: url(http://localhost/rssmonster/public/img/search.svg) 14px 13px no-repeat;
}
</style>