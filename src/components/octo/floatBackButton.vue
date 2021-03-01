<template>
  <v-app-bar
    dense
    app
    elevation="0"
    flat
    absolute
    scroll-off-screen
  >
    <v-btn
      v-model="fab"
      color="blue darken-2"
      dark
      fab
    >
      <v-icon v-if="fab">
        mdi-close
      </v-icon>
      <v-icon v-else>
        mdi-account-circle
      </v-icon>
    </v-btn>
  </v-app-bar>
</template>

<script>
  export default {

  }
</script>

<style>

</style>
