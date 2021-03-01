<template>
  <v-row
    align="center"
    justify="center"
    dense
  >
    <v-col
      v-for="(item, i) in tags"
      :key="i"
      cols="auto"
    >
      <octo-list-item
        :text="item.text"
        :icon="item.icon"
        color="#48667466"
        text-color="primary"
      />
    </v-col>
  </v-row>
</template>

<script>
  export default {
    data () {
      return {
        tags: [
          { icon: 'mdi-google-play', text: 'Available on Android' },
          { icon: 'mdi-unity', text: 'Made with Unity' },
          { icon: 'mdi-peace', text: 'Indie developers' },
          { icon: 'mdi-account-group', text: 'Multiplayer' },
          { icon: 'mdi-progress-wrench', text: 'Closed beta' },
          { icon: 'mdi-flag-variant-outline', text: 'First release in June' },
        ],
      }
    },
  }
</script>
