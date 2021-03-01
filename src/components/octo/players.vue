<template>
  <v-row
    no-gutters
    class="pa-2"
    justify="center"
    align="center"
  >
    <v-col
      cols="6"
      class="text-center"
    >
      <base-subtitle
        title="Players: "
        class="primaryText"
        size="subtitle-1"
        mobile-size="subtitle-2"
        space="0"
      />
    </v-col>
    <v-col
      align-self="center"
      cols="6"
    >
      <base-subtitle
        title="Multiplayer"
        class="primaryText"
        size="subtitle-2"
        space="0"
      />
    </v-col>
  </v-row>
</template>

<script>
  export default {
    name: 'Players',
  }
</script>
