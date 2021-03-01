<template>
  <v-row
    no-gutters
    class="py-2"
  >
    <v-col
      cols="2"
      sm="1"
      class="text-center"
    >
      <v-icon>
        {{ icon }}
      </v-icon>
    </v-col>
    <v-col align-self="center">
      <base-subtitle
        :title="text"
        :html="html"
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
      html: String,
      icon: {
        type: String,
        default: 'mdi-heart',
      },
    },
  }
</script>
