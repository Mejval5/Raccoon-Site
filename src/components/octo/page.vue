<template>
  <v-fade-transition
    origin="top center 0"
  >
    <v-container
      v-show="visible"
      class="expansionPanel pa-0"
      style="height: 100vh; width: 100%;"
      fluid
    >
      <v-row
        dense
        align-content="center"
        style="height: inherit"
        justify="center"
        no-gutters
      >
        <v-col
          align-self="center"
          style="height: inherit;"
          class="hideScroll"
          cols="12"
        >
          <slot
            :visible="visible"
            @clicked="clicked"
          />
        </v-col>
      </v-row>
    </v-container>
  </v-fade-transition>
</template>

<script>
  export default {
    name: 'Octomancer',
    props: {
      visible: Boolean,
    },
    methods: {
      clicked (value) {
        this.$emit('clicked', value)
      },
    },
  }
</script>

<style>

</style>
