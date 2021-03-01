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
        :icon-color="item.iconColor"
        color="transparent"
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
          { icon: 'mdi-sword-cross', iconColor: 'primary', text: 'Action' },
          { icon: 'mdi-gamepad-square', iconColor: 'primary', text: 'Arcade' },
          { icon: 'mdi-flower', iconColor: 'primary', text: 'Casual' },
          { icon: 'mdi-run-fast', iconColor: 'primary', text: 'Platformer' },
        ],
      }
    },
  }
</script>
