<template>
  <div id="mobile-container" v-if="mobile" class="overlay">
    <h5 class="mobile-title">Options</h5>
    <button type="button" class="close" data-dismiss="modal" aria-label="Close" @click="closeModal">
      <span class="close" aria-hidden="true">&times;</span>
    </button>

    <div class="overlay-content" id="mobile">
      <p class="content-header">Select which category you want to display</p>
      <ul class="categories">
        <li class="category" v-on:click="store.currentSelection.categoryId = '%'">
          <span class="glyphicon">
            <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
          </span>
          <span>Show all categories</span>
        </li>
        <li
          class="category"
          v-on:click="store.currentSelection.categoryId = category.id"
          v-for="category in store.categories"
          :key="category.id"
          v-bind:id="category.id"
        >
          <span class="glyphicon">
            <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
          </span>
          <span>{{ category.name }}</span>
        </li>
      </ul>
      <p class="content-header">Select how the articles should be displayed</p>
      <button
        @click="store.filter = 'full'"
        type="button"
        class="btn btn-primary content"
      >Full content</button>
      <button
        @click="store.filter = 'minimal'"
        type="button"
        class="btn btn-primary content"
      >Minimal content</button>

      <p class="content-header">Click the button below to add a new feed</p>
      <button @click="showNewFeed()" type="button" class="btn btn-success">Add new feed</button>
      <br><br>
    </div>
  </div>
</template>

<style>
@media screen and (max-height: 450px) {
  .overlay a {
    font-size: 20px;
  }
}

.overlay {
  height: 100%;
  width: 100%;
  position: fixed;
  z-index: 9999;
  left: 0;
  top: 0;
  background-color: white;
  overflow-x: hidden;
}

.mobile-title {
  padding: 10px;
  background-color: #31344B;
  color: #FFF;
}

.overlay-content {
  position: relative;
  width: 100%;
  text-align: left;
  margin-top: 5px;
  margin-left: 10px;
  margin-right: 10px;
}

.close {
  position: fixed;
  top: 10px;
  right: 20px;
}

span.close {
  color: #FFF !important;
  opacity: none !important;
}

.overlay-content ul.categories {
  list-style-type: none;
  text-indent: 4px;
  padding-left: 0px;
  width: 95%;
}

.overlay-content li.category {
  background-color: #464f9e;
  border-radius: 4px;
  color: #fff;
  padding: 0px;
  margin-bottom: 6px;
}

button.close span {
  color: #111;
}

p.content-header {
    margin-top: 10px;
    margin-bottom: 3px;
}
</style>

<script>
import store from "../store";

export default {
  props: ["mobile"],
  data() {
    return {
      store: store
    };
  },
  methods: {
    closeModal: function() {
      this.emitClickEvent("mobile", null);
    },
    emitClickEvent(eventType, value) {
      this.$emit(eventType, value);
    },
    showNewFeed() {
      this.emitClickEvent("mobile", null);
      this.$emit("modal", "newfeed");
    }
  }
};
</script>