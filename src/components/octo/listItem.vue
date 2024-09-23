<template>
  <v-chip
    class="ma-0"
    v-bind="$attrs"
    outlined
    v-on="$listeners"
    @click="clickedAnimation"
  >
    <v-icon
      left
      medium
      :color="iconColor"
    >
      {{ icon }}
    </v-icon>
    <div
      class="primaryText text-subtitle-2"
    >
      {{ text }}
    </div>
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

        target.className += ' getSmall'
        await new Promise(resolve => setTimeout(resolve, 250))
        target.classList.remove('getSmall')

        target.className += ' getBigLittle'
        await new Promise(resolve => setTimeout(resolve, 200))
        target.classList.remove('getBigLittle')

        target.className += ' getSmallLittle'
        await new Promise(resolve => setTimeout(resolve, 150))
        target.classList.remove('getSmallLittle')

        target.className += ' getNormal'
        await new Promise(resolve => setTimeout(resolve, 100))
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
.getSmall {
  transform: scale(0.8);
  transition: all 0.25s ease-in-out;
}
.getBigLittle {
  transform: scale(1.1);
  transition: all 0.2s ease-in-out;
}
.getSmallLittle {
  transform: scale(0.95);
  transition: all 0.15s ease-in-out;
}
.getNormal {
  transform: scale(1.0);
  transition: all 0.1s ease-in-out;
}
.v-chip:before {
  background-color: transparent;
}
</style>
