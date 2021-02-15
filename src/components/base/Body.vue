<template>
  <component
    :is="tag"
    :class="classes"
    :style="styles"
    v-bind="$attrs"
    v-on="$listeners"
  >
    <!-- Only use v-html for user data -->
    <div
      v-if="text"
      v-text="text"
    />

    <div
      v-else-if="html"
      v-html="html"
    />

    <slot v-else />
  </component>
</template>

<script>
  // Mixins
  import Heading from '@/mixins/heading'

  export default {
    name: 'BaseBody',

    mixins: [Heading],

    inject: ['theme'],

    props: {
      html: String,
      size: {
        type: String,
        default: 'subtitle-1',
      },
      mobileSize: {
        type: String,
        default: 'subtitle-2',
      },
      maxWidth: {
        type: [Number, String],
        default: undefined,
      },
      space: {
        type: [Number, String],
        default: 0,
      },
      tag: {
        type: String,
        default: 'p',
      },
      text: String,
    },

    computed: {
      classes () {
        return [
          'base-body',
          this.fontSize,
          `text-${this.heading.align}`,
          `mb-${this.space}`,
        ]
      },
      styles () {
        return {
          maxWidth: `${this.maxWidth}px`,
        }
      },
      fontSize () {
        return this.$vuetify.breakpoint.mdAndUp
          ? this.size
          : this.mobileSize
      },
    },
  }
</script>
