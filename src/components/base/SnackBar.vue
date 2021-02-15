<template>
  <div
    class="text-center"
  >
    <v-snackbar
      v-model="snackbar"
      v-on:
      :timeout="timeout"
      style="z-index: 2000;"
    >
      {{ text }}

      <template v-slot:action="{ attrs }">
        <v-btn
          color="blue"
          text
          v-bind="attrs"
          @click="snackbar = false"
        >
          Close
        </v-btn>
      </template>
    </v-snackbar>
  </div>
</template>

<script>
  export default {
    props: {
      updateSnack: Boolean,
      text: String,
      timeout: String,
    },
    data: () => ({
      snackbar: false,
    }),
    methods: {
      openSnack () {
        this.snackbar = true
      },
    },
  }
</script>
