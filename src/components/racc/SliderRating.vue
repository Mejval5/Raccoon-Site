<template>
  <v-container
  fluid
  class="py-0"
  >
    <v-row
    align="center"
    justify="start"
    >
      <v-col
      v-if="icon"
      cols="auto"
      class="pa-0 pr-4"
      >
        <v-icon
        color="primary"
        >
          {{icon}}
        </v-icon>
      </v-col>
      <v-col
      class="pl-0"
      >
      <base-title
        :title="label"
        class="pl-0"
        size="title"
        mobile-size="subtitle-1"
        space="0"
      />
      </v-col>
    </v-row>
    <v-row>
      <v-col
      cols="12"
      class="pa-0 pt-3"
      >
        <v-slider
          readonly
          :value="value"
          class="my-slider"
          color="purple"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  export default {
    props: {
      value: Number,
      label: String,
      icon: String,
    },
  }
</script>

<style>
.my-slider .v-slider--horizontal {
  margin-left: 0;
  margin-right: 0;
}
.my-slider .v-slider--horizontal .v-slider__track-container {
  height: 6px;
  border-radius: 24px;
  overflow: hidden;
}
</style>
