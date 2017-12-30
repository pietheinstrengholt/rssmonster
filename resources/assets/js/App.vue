<template>
    <div id="app">
        <div class="row" style="margin-right:0px;">
            <div class="sidebar col-md-2" style="position:fixed">
                <app-quickbar></app-quickbar>
                <app-sidebar></app-sidebar>
            </div>
            <div class="home col-md-10 col-md-offset-2">
                <app-quickbar></app-quickbar>
                <app-home></app-home>
            </div>
        </div>
    </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 988px) {
	div.sidebar {
        display:none;
    }
	div.article {
        display: inline-block;
        position: relative;
        border-bottom: 0px solid #FFF !important;
    }
    div.article:after {
        position: absolute;
        content: '';
        border-bottom: 1px solid #a0a3a8;
        width: 90%;
        transform: translateX(-50%);
        left: 50%;
    }
    div.col-md-10 {
        padding-right: 0px;
    }

    div.main {
        margin-top: 50px;
    }

    .view-toolbar {
        position: fixed;
        z-index: 9999;
    }

    div#main {
        padding-top: 42px;
    }
}

/* Desktop */
@media (min-width: 988px) {
	div.home div.quickbar {
        display:none;
    }
}
</style>

<script>
    import Sidebar from './components/Sidebar.vue';
    import Home from './components/Home.vue';
    import Quickbar from './components/Quickbar.vue';
    export default {
        components: {
            appSidebar: Sidebar,
            appHome: Home,
            appQuickbar: Quickbar
        }
    }
</script>
