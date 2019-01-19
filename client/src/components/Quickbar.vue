<template>
  <div class="quickbar view-toolbar">
    <a
      @click="emitClickEvent('modal','mobile')"
      id="rssmonster"
      class="view-button"
      data-behavior="view_unread change_view_mode"
      data-view-mode="view_unread"
      data-remote="true"
    ></a>
    <a
      v-on:click="loadType('unread')"
      v-bind:class="{ 'selected':  store.currentSelection.status === 'unread' }"
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
      v-bind:class="{ 'selected':  store.currentSelection.status === 'read' }"
      id="read"
      class="view-button selected"
      title="View read"
      data-behavior="view_all change_view_mode"
      data-view-mode="view_all"
      data-remote="true"
    >
      <i class="far fa-circle" data-fa-transform="down-0 shrink-0 left-5"></i>
      Read {{ this.store.readCount }}
    </a>
    <a
      v-on:click="loadType('star')"
      v-bind:class="{ 'selected':  store.currentSelection.status === 'star' }"
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
  </div>
</template>

<style>
div.quickbar a {
  font-size: 12px;
  cursor: pointer;
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
      this.store.currentSelection.status = status;
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    }
  }
};
</script>
