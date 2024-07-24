<template>
  <div id="mobile-toolbar">
    <a
      @click="emitClickEvent('mobile','mobile')"
      id="rssmonster"
      class="view-button"
      data-behavior="view_unread change_view_mode"
      data-view-mode="view_unread"
      data-remote="true"
    ></a>
    <a
      v-on:click="loadType('unread')"
      v-bind:class="{ 'selected':  store.currentSelection.status == 'unread' }"
      id="unread"
      class="view-button"
      title="View unread"
      data-behavior="view_unread change_view_mode"
      data-view-mode="view_unread"
      data-remote="true"
    >
      <i class="fas fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>
      Unread {{ this.store.unreadCount }}
    </a>
    <a
      v-on:click="loadType('read')"
      v-bind:class="{ 'selected':  store.currentSelection.status == 'read' }"
      id="read"
      class="view-button"
      title="View read"
      data-behavior="view_read change_view_mode"
      data-view-mode="view_read"
      data-remote="true"
    >
      <i class="far fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>
      Read {{ this.store.readCount }}
    </a>
    <a
      v-on:click="loadType('star')"
      v-bind:class="{ 'selected':  store.currentSelection.status == 'star' }"
      id="star"
      class="view-button"
      title="View starred"
      data-behavior="view_starred change_view_mode"
      data-view-mode="view_starred"
      data-remote="true"
    >
      <i class="far fa-heart" data-fa-transform="down-0 shrink-0 left-5"></i>
      Star {{ this.store.starCount }}
    </a>
    <a
      v-on:click="loadType('hot')"
      v-bind:class="{ 'selected':  store.currentSelection.status == 'hot' }"
      id="hot"
      class="view-button"
      title="View hot"
      data-behavior="view_hot change_view_mode"
      data-view-mode="view_hot"
      data-remote="true"
    >
      <i class="far fa-heart" data-fa-transform="down-0 shrink-0 left-5"></i>
      Hot {{ this.store.hotCount }}
    </a>
  </div>
</template>

<style>
#mobile-toolbar {
  width: 100%;
  background-color: #3b4651;
  display: -webkit-box;
  display: -webkit-flex;
  display: -ms-flexbox;
  display: flex;
  height: 41px;
  border-bottom: 1px solid transparent;
  border-color: #dcdee0;
  position: fixed;
  color: #fff;
  visibility: visible;
  opacity: 1;
  transition: visibility 0s linear 0s, opacity 150ms;
}
</style>

<style scoped>
#mobile-toolbar a {
  font-size: 12px;
  cursor: pointer;
}

#mobile-toolbar.hide {
  visibility: hidden;
  opacity: 0;
  transition: visibility 0s linear 150ms, opacity 150ms;
}

.view-button {
  -webkit-box-flex: 1;
  -webkit-flex: 1;
  -ms-flex: 1;
  flex: 1;
  text-align: center;
  line-height: 41px;
  height: 100%;
  text-decoration: none;
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  font-weight: bold;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
  color: #b4b6b8;
}

#rssmonster.view-button {
  background: url(../assets/images/monster-dark.png) 10px 10px no-repeat;
  background-size: 20px 20px;
  max-width: 40px;
  min-width: 40px;
}

#title.view-button {
  text-align: left;
  margin-left: 10px;
  max-width: 90px;
}

#unread.view-button,
#star.view-button,
#read.view-button,
#hot.view-button {
  border-left: 1px solid transparent;
  border-color: #dcdee0;
  cursor: pointer;
}

.view-button.selected {
  color: #fff;
}

@media (prefers-color-scheme: dark) {
  #mobile-toolbar {
    background: #3a3a3a;
  }

  .view-toolbar,
  .view-button {
    color: #fff;
    background: #3a3a3a;
    border-color: #000;
  }

  #rssmonster.view-button,
  #unread.view-button,
  #star.view-button,
  #read.view-button,
  #hot.view-button {
    border-bottom: 1px solid #fff;
  }

  .view-button.selected {
    color: #3be6c4;
  }

}
</style>

<script>
import store from "../store";

export default {
  data() {
    return {
      store: store
    };
  },
  methods: {
    loadType: function(status) {
      //if user selects current selection, then do a forceReload by emitting an event to parent
      if (status == this.store.currentSelection.status) {
        this.$emit('forceReload');
      } else {
        this.store.currentSelection.status = status;
      }
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    }
  }
};
</script>