<template>
  <v-row
    no-gutters
    class="py-2"
  >
    <v-col
      cols="1"
      class="text-center"
    >
      <v-icon
        x-small
      >
        {{ icon }}
      </v-icon>
    </v-col>
    <v-col align-self="center">
      <base-subtitle
        :title="text"
        class="primaryText"
        size="subtitle-2"
        space="0"
      />
    </v-col>
  </v-row>
</template>

<script>
  export default {
    name: 'Item',
    props: {
      text: String,
      icon: {
        type: String,
        default: 'mdi-heart',
      },
    },
  }
</script>
