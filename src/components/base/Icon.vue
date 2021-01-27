<template>
<v-btn
icon
:href="href"
:target="target"
>
  <v-icon
    :size="size"
    v-bind="$attrs"
    v-on="$listeners"
  >
    <slot />
  </v-icon>
</v-btn>
</template>

<script>
  export default {
    name: 'BaseIcon',

    props: {
      target: String,
      href: String,
      size: {
        type: [Number, String],
        default: 56,
      },
    },
  }
</script>
