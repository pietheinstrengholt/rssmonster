<template>
  <div id="mobile-container" v-if="mobile">
    <div class="modal-mask">
      <div class="modal fade" id="mobile" tabindex="-1" role="dialog" aria-hidden="true">
        <div class="modal-dialog modal-dialog-centered modal-wrapper" role="document">
          <div class="modal-content modal-container">
            <div class="modal-header">
              <h5 class="modal-title">Categories</h5>
              <button
                type="button"
                class="close"
                data-dismiss="modal"
                aria-label="Close"
                @click="closeModal"
              >
                <span aria-hidden="true">&times;</span>
              </button>
            </div>

            <div class="modal-body" id="mobile">
              <p>Select which category you want to display</p>
              <ul class="categories">
                <li class="category" v-on:click="store.currentSelection.category = null">
                  <span class="glyphicon">
                    <i class="far fa-folder" data-fa-transform="down-5 shrink-2"></i>
                  </span>
                  <span>Show all categories</span>
                </li>
                <li
                  class="category"
                  v-on:click="store.currentSelection.category = category.id"
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
              <p>Select how the articles should be displayed</p>
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

              <p>Click the button below to add a new feed</p>
              <button @click="modal = 'newfeed'" type="button" class="btn btn-success">Add new feed</button>
            </div>
            <div class="modal-footer">
              <button
                type="button"
                class="btn btn-secondary"
                data-dismiss="modal"
                @click="emitClickEvent('mobile',null)"
              >Cancel</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style>
/* Landscape phones and portrait tablets */
@media (max-width: 766px) {
  div##mobile {
    padding-top: 200px;
  }

  div.modal-body p {
    margin-bottom: 3px;
  }
}

/* Desktop */
@media (min-width: 766px) {
  #mobile-container {
    display: nome;
  }
}

#mobile.modal {
  display: inline;
  opacity: 1;
}

div.modal-dialog {
  max-width: 800px;
  margin: 0px;
}

.modal-mask {
  position: fixed;
  z-index: 10001;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  display: table;
  transition: opacity 0.3s ease;
}

.modal-container {
  margin: 0px auto;
  background-color: #fff;
  border-radius: 2px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.33);
  transition: all 0.3s ease;
  color: #111;
}

.modal-enter {
  opacity: 0;
}

.modal-leave-active {
  opacity: 0;
}

.modal-enter .modal-container,
.modal-leave-active .modal-container {
  -webkit-transform: scale(1.1);
  transform: scale(1.1);
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
    }
  }
};
</script>