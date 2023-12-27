<template>
  <v-container
    fluid
    class="pa-0"
  >
    <v-row
      align="center"
      justify="start"
      no-gutters
    >
      <v-col
        cols="6"
      >
        <v-col
          v-if="icon"
          cols="auto"
          class="pa-0 pr-4"
        >
          <v-icon
            color="primary"
          >
            {{ icon }}
          </v-icon>
        </v-col>
        <v-col
          class="pl-0"
          cols="auto"
        >
          <base-title
            :title="label"
            class="pl-0"
            size="title"
            mobile-size="subtitle-1"
            space="0"
          />
        </v-col>
      </v-col>
      <v-col
        cols="auto"
        class="pa-0"
      >
        <v-rating
          empty-icon="mdi-circle-outline"
          full-icon="mdi-circle"
          color="orange"
          background-color="orange"
          hover
          length="5"
          size="20"
          readonly
          :value="value"
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
