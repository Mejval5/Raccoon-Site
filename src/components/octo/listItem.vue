<template>
  <v-chip
    class="ma-2"
    v-bind="$attrs"
    outlined
    v-on="$listeners"
    @click="clickedAnimation"
  >
    <v-icon
      left
      :color="iconColor"
    >
      {{ icon }}
    </v-icon>
    {{ text }}
  </v-chip>
</template>

<script>
  export default {
    name: 'ListItem',
    props: {
      text: String,
      icon: String,
      iconColor: String,
    },
    methods: {
      async clickedAnimation (e) {
        var target = e.path[1]
        if (target.nodeName === 'SPAN') {
          target = e.path[2]
        }
        target.className += ' getBig'
        await new Promise(resolve => setTimeout(resolve, 200))
        target.classList.remove('getBig')
        target.className += ' getNormal'
        await new Promise(resolve => setTimeout(resolve, 200))
        target.classList.remove('getNormal')
      },
    },
  }
</script>

<style>
.getBig {
  transform: scale(1.2);
  transition: all 0.2s ease-in-out;
}
.getNormal {
  transform: scale(1.0);
  transition: all 0.2s ease-in-out;
}
.v-chip:before {
  background-color: transparent;
}
</style>
