<template>
  <component
    :is="tag"
    :class="classes"
    v-bind="$attrs"
    v-on="$listeners"
  >
    <template v-if="title">
      {{ title }}
    </template>

    <slot v-else />
  </component>
</template>

<script>
  export default {
    name: 'BaseHeading',

    inject: {
      theme: {
        default: () => ({ isDark: true }),
      },
      heading: {
        default: () => ({ align: 'left' }),
      },
    },

    provide () {
      return {
        heading: {
          align: this.align,
        },
      }
    },

    props: {
      align: {
        type: String,
        default () {
          return this.heading.align
        },
      },
      dense: {
        type: Boolean,
        default () {
          return this.isDense
        },
      },
      size: {
        type: String,
        default: 'display-2',
      },
      space: {
        type: [Number, String],
        default: 4,
      },
      mobileSize: {
        type: String,
        default: 'display-1',
      },
      mobileBreakPoint: {
        type: [Number, String],
        default: 768,
      },
      tag: {
        type: String,
        default: 'h3',
      },
      title: String,
      weight: {
        type: String,
        default: '',
      },
    },

    computed: {
      classes () {
        const classes = [
          this.fontSize,
          `font-weight-${this.weight}`,
          `mb-${this.space}`,
          `text-${this.align}`,
        ]

        return classes
      },
      fontSize () {
        return this.$vuetify.breakpoint.width >= this.mobileBreakPoint
          ? this.size
          : this.mobileSize
      },
    },
  }
</script>
